const LIFECYCLES = [ 'env', 'start', 'request', 'error', 'teardown' ]

class Func {

  constructor(options) {
    options = options || { }
    this.NODE_ENV = options.NODE_ENV || process.env.NODE_ENV || 'development'
    this.middleware = {
      env: [ ],
      start: [ ],
      request: [ ],
      error: [ ],
      teardown: [ ]
    }
    this.started = false
    this.setExpiration(options.expiry || 0)
    this.environment = { }
    this.logger = this.initLogger(options)
  }

  // CONFIGURATION 
  initLogger(options) {
    options = options || { }
    let logger = new LoggerWrapper({
      LOG_LEVEL: options.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
      logger: options.logger, // if null then LoggerWrapper will use ConsoleLogger by default
      prettify: options.prettify
    })
    logger.state({ src: "funcmatic", lifecycle: "system" })
    return logger
  }

  setExpiration(ms, t) {
    if (ms == 0) {
      this.expiry = 0
      this.expiresAt = null
      return
    }
    t = t || (new Date()).getTime()
    this.expiry = ms
    this.expiresAt = t + ms
  }

  // MIDDLEWARE

  env(obj) { this.use(obj, { lifecycle: 'env' }) }
  start(obj) { this.use(obj, { lifecycle: 'start' }) }
  request(obj) { this.use(obj, { lifecycle: 'request' }) }
  error(obj) { this.use(obj, { lifecycle: 'error' }) }
  teardown(obj) { this.use(obj, { lifecycle: 'teardown' }) }
  
  plugin(obj) {
    if (!isPlugin(obj)) throw new Error("Middleware must be a valid plugin!")
    for (let lifecycle of LIFECYCLES) {
      let fn = obj[lifecycle]
      if (fn && isFunction(fn)) {
        fn = fn.bind(obj)
        fn['_plugin'] = obj.constructor.name // HACK
        this[lifecycle](fn)
      }
    }
  }

  useFunction(fn, meta) {
    this.middleware[meta.lifecycle].push(fn)
  }

  use(obj, meta) {
    meta = meta || { }
    if (Array.isArray(obj)) {
      for (var mw of obj) {
        this.use(mw, meta)
      }
    } else if (isPlugin(obj)) {
      this.plugin(obj, meta)
    } else if (isFunction(obj)) {
      this.useFunction(obj, meta)
    } else {
      throw new Error('Must provide a plugin, function, or array of plugins/functions')
    }
  }

  // INVOCATION

  initCtx(ctx) {
    if (!ctx.env) ctx.env = this.environment
    if (!ctx.event) ctx.event = { }
    if (!ctx.context) ctx.context = { } 
    if (!ctx.state) ctx.state = { }
    if (!ctx.logger) ctx.logger = this.logger   
    if (!ctx.func) ctx.func = this
    if (!ctx.stack) ctx.stack = [ ]
  }

  async invoke(ctx, options) {
    options = options || { } 
    this.initCtx(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'system' })
    try {
      if (this.isColdStart() || options.forceColdStart) {
        await this.handleCold(ctx, options)
      } else {
        ctx.state.coldstart = false
        ctx.env = this.environment
      }
      await this.handleWarm(ctx, options)
    } catch (err) {
      await this.handleError(err, ctx, options)
    } 
    ctx.logger.state(false) // we clear the state metadata
    return ctx.response
  }

  async handleCold(ctx, options) {
    ctx.state.coldstart = true
    if (this.started) {
      // This is a restart (force, expiration) rather than
      // a true coldstart. We call invokeTeardown so that 
      // this and plugins can reset state.
      ctx.logger.trace('--------------- TEARDOWN BEGIN ---------------')
      await this.invokeTeardown()
      ctx.logger.trace('--------------- TEARDOWN END ---------------')
    }
    ctx.logger.trace('--------------- ENV BEGIN ---------------')
    await this.invokeEnv(ctx)
    this.environment = ctx.env
    ctx.logger.trace(`ctx.env=${JSON.stringify(ctx.env, null, 2)}`)
    ctx.logger.trace('--------------- ENV END ---------------')
    ctx.logger.trace('--------------- START BEGIN ---------------')
    await this.invokeStart(ctx)
    ctx.logger.trace('--------------- START END ---------------')
    this.started = true
  }

  async handleWarm(ctx, options) {
    ctx.logger.trace('--------------- REQUEST BEGIN ---------------')
    await this.invokeRequest(ctx)
    ctx.logger.trace('--------------- REQUEST END ---------------')
  }

  async handleError(err, ctx, options) {
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'system' })
    ctx.logger.trace('--------------- ERROR BEGIN ---------------')
    ctx.logger.error(`Uncaught error in ${ctx.stack[ctx.stack.length-1].component}`)
    ctx.logger.error(err)
    ctx.error = err
    try { 
      // Error handlers can have errors
      await this.invokeError(ctx)
    } catch (err) {
      // Just log the error
      ctx.logger.error("Uncaught error in error middleware")
      ctx.logger.error(err)
    }
    ctx.logger.trace('--------------- ERROR END ---------------')
  }

  async invokeEnv(ctx) {
    this.initCtx(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'env' })
    let stack = compose(this.middleware['env'])
    await stack(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'system' })
    return
  }

  async invokeStart(ctx) {
    this.initCtx(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'start' })
    let stack = compose(this.middleware['start'])
    await stack(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'system' })
    return
  }

  async invokeRequest(ctx) {
    this.initCtx(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'request' })
    let stack = compose(this.middleware['request'])
    await stack(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'system' })
    return 
  }

  // The theory is that we only get here for unhandled errors
  // since all MW and user can handle errors using try catch
  // This is only called when unhandled error bubbles up
  async invokeError(ctx) {
    this.initCtx(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'error' })
    if (this.NODE_ENV != 'production') {
      // if we are not in production mode then expose 
      // the error message and stack trace
      if (ctx.error) {
        ctx.error.expose = true
        ctx.error.stacktrace = true
      }
    }
    let stack = compose(this.middleware['error'])
    await stack(ctx)
    ctx.logger.state({ src: 'funcmatic', lifecycle: 'system' })
    return
  }

  /**
   * Only intended to be called for testing
   * no context or next just unconditional teardown
   */
  async invokeTeardown() {
    // manually go through middlewares and call teardown log but don't stop on errors
    for (var fn of this.middleware['teardown']) {
      try {
        await fn()
      } catch (err) {
        // log it and move on
        this.logger.error(err)
      }
    }
    // after we are done we reset the state
    this.started = false
    this.environment = { }
    this.setExpiration(this.expiry) // restart the expiry clock
    this.logger.env(false)
    this.logger.state(false)
    this.logger.state({ src: "funcmatic", lifecycle: "system" })
  }

  isColdStart(t) {
    t = t || (new Date()).getTime()
    // true cold start (never been started)
    if (!this.started) return true
    // treat as cold start because expired
    if (this.isExpired(t)) {
      return true
    }
    return false 
  }

  isExpired(t) {
    t = t || (new Date()).getTime()
    return this.expiresAt && this.expiresAt <= t
  }

  // AWS 

  handler() {
    return async (event, context) => {
      return await this.invoke({ event, context })
    }
  }
}

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
}

function isPlugin(obj) {
  return !!(obj && (obj.env || obj.start || obj.request || obj.error || obj.teardown))
}

function createInstance(options) {
  return new Func(options || {})
}


const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  off: 70
}

const NAMES = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
  70: 'off'
}

class LoggerWrapper {

  constructor(options) {
    options = options || { }
    this.logger = options.logger || new ConsoleLogger({ LOG_LEVEL: options.LOG_LEVEL, prettify: options.prettify })
    this.lev = options.LOG_LEVEL && LEVELS[options.LOG_LEVEL] || LEVELS['info']
    this.envfields = options.env || { }
    this.statefields = options.state || { }
  }

  level(name) {
    if (name) {
      this.lev = LEVELS[name]
    }
    return NAMES[this.lev]
  }

  env(newfields, options) {
    options = options || { }
    if (newfields === false) this.envfields = { }
    if (newfields && options.replace) this.envfields = newfields
    if (newfields) Object.assign(this.envfields, newfields)
    return this.envfields
  }

  state(newfields, options) {
    options = options || { }
    if (newfields === false) this.statefields = { }
    if (newfields && options.replace) this.statefields = newfields
    if (newfields) Object.assign(this.statefields, newfields)
    return this.statefields
  }

  merge(fields) {
    return Object.assign({ }, this.envfields, this.statefields, fields)
  }

  standardfields(level_name) {
    return {
      time: Date.now(),
      level: LEVELS[level_name],
      level_name
    }
  }

  trace(...args) {
    if (this.lev > LEVELS['trace']) return
    args.unshift(this.merge(this.standardfields('trace')))
    return this.logger.trace(...args)
  }

  debug(...args) {
    if (this.lev > LEVELS['debug']) return
    args.unshift(this.merge(this.standardfields('debug')))
    return this.logger.debug(...args)
  }

  info(...args) {
    if (this.lev > LEVELS['info']) return
    args.unshift(this.merge(this.standardfields('info')))
    return this.logger.info(...args)
  }

  warn(...args) {
    if (this.lev > LEVELS['warn']) return
    args.unshift(this.merge(this.standardfields('warn')))
    return this.logger.warn(...args)
  }

  error(...args) {
    if (this.lev > LEVELS['error']) return
    args.unshift(this.merge(this.standardfields('error')))
    return this.logger.error(...args)
  }

  fatal(...args) {
    if (this.lev > LEVELS['fatal']) return
    args.unshift(this.merge(this.standardfields('fatal')))
    return this.logger.fatal(...args)
  }
}


class ConsoleLogger {

  constructor(options) {
    options = options || { }
    this.console = options.console || console
    this.prettify = options.prettify
  }

  trace(...args) {
    let l = this.line(args)
    this.console.debug(l) // console.trace autoprints stack so we use console.debug
    return l
  }

  debug(...args) {
    let l = this.line(args)
    this.console.debug(l)
    return l
  }

  info(...args) {
    let l = this.line(args)
    this.console.info(l)
    return l
  }

  warn(...args) {
    let l = this.line(args)
    this.console.warn(l)
    return l
  }

  error(...args) {
    let l = this.line(args)
    this.console.error(l)
    return l
  }

  fatal(...args) {
    let l = this.line(args)
    this.console.error(l) // no console.fatal so use console.error
    return l
  }

  line(args) {
    // arg[0] are the fields passed from Funcmatic 
    let fields = args[0]
    let line = { }
    // arg[1..n] are the args the user passed in their ctx.logger call: ctx.logger.info(...)
    // this simple logger only supports 1 user passed arg (arg[1])
    switch(typeof args[1]) {
      case 'string':
        let msg = args[1]
        line = Object.assign({ }, fields, { msg })
        break
      case 'object':
        let obj = args[1]
        if (obj instanceof Error ) {
          // Use Bunyan convention of 'msg' and 'err' if Error object is passed
          obj = { 
            msg: obj.message,
            err: obj.stack
          }
        }
        line = Object.assign({ }, fields, obj)
        break
    }
    return this.prettify && this.prettify(line) || line
  }
}

/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 *
 * Adapted from https://github.com/koajs/compose
 * 
 * @param {Array} middleware
 * @return {Function}
 * @api public
 */

function compose(middleware) {
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!')
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
  }

  // return a new middleware that can be called with (ctx) or (ctx, next)
  return async (ctx, next) => {
    // last called middleware #
    let index = -1
    if (!ctx.stack) {
      ctx.stack = [ ]
    }
    // wrapper around the invocation of an individual middleware function
    async function dispatch(i) {
      if (i <= index) throw new Error('next() called multiple times')
      index = i
      // the specific middleware function to invoke (middleware[i])
      let fn = middleware[i]
      // if we've reached the end of middleware stack
      // invoke what was passed as 'next' to this composed middleware
      if (i === middleware.length) fn = next
      // if no next was passed to this composed middleware we just return
      // which starts the response cascade back to the first middleware
      // i.e. all the 'await next()' in the middleware functions will start resolving
      // Of course, we only get here if hte last function in the middleware stack
      // is middleware (ctx, next) and invokes next()
      // if the last function is a 'user' function (ctx) and never calls next
      // then await next() will resolve before getting to this point.
      if (!fn) return null
      // the next function we are going to pass this specific middleware
      // whose main job is to invoke the next middleware function in the stack
      // i.e. middleware[i+1]
      async function nextmw() {
        // this gets invoked before control is 
        // passed to next middleware function
        beforeNextMiddleware(ctx, fn, i)
        // invoke the next middleware function (i+1)
        await dispatch(i+1)
        // this is called after the (i+1) middleware function returns
        afterNextMiddleware(ctx, fn, i)
      }
      // invoked before this middleware function is invoked
      beforeMiddleware(ctx, fn, i)
      // run the middleware function
      await fn(ctx, nextmw)
      // invoked after the middleware function exits
      afterMiddleware(ctx, fn, i)
    }
    return dispatch(0)
  }
}

function getComponentName(fn) {
  let plugin = fn['_plugin'] || fn.constructor.name
  let fname = getFunctionName(fn)
  return `${plugin}:${fname}`
}

function getFunctionName(fn) {
  let name = fn.name
  if (name.startsWith("bound ")) {
    return name.substring("bound ".length)
  }
  return name || "[anonymous]"
}

function beforeMiddleware(ctx, fn, i) {
  let meta = {
    i,
    src: getComponentName(fn),
    tbmw: Date.now(),
    tbnmw: 0,
    tanmw: 0,
    tamw: 0
  }
  ctx.stack.push(meta)
  ctx.logger.state({ src: meta.src })
  ctx.logger.trace(`BEGIN: ${meta.src}`)
}

function afterMiddleware(ctx, fn, i) {
  let meta = ctx.stack.pop()
  meta.tamw = Date.now()
  let duration = meta.tamw - meta.tbmw
  let execution = duration
  if (meta.tbnmw > 0 && meta.tanmw > 0) {
    execution = (meta.tbnmw - meta.tbmw) + (meta.tamw - meta.tanmw)
  }
  ctx.logger.trace({ msg: `END: ${meta.src}`, duration, execution })
}

function beforeNextMiddleware(ctx, fn, i) {
  let meta = ctx.stack[ctx.stack.length - 1]
  meta.tbnmw = Date.now()
}

function afterNextMiddleware(ctx, fn, i) {
  let meta = ctx.stack[ctx.stack.length - 1]
  meta.tanmw = Date.now()
  ctx.logger.state({ src: meta.src })
}

// Create the default instance to be exported
let func = createInstance()

// Expose Func class
func.Func = Func

// Expose Logging classes
func.LoggerWrapper = LoggerWrapper
func.ConsoleLogger = ConsoleLogger

// Expose compose 
func.compose = compose

// Factory for creating new instances
func.create = createInstance


module.exports = func