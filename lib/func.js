const LIFECYCLES = [ 'env', 'start', 'request', 'error', 'teardown' ]

class Func {

  constructor(options) {
    options = options || { }
    this.NODE_ENV = options.NODE_ENV || process.env.NODE_ENV || 'development'
    this.LOG_LEVEL = options.LOG_LEVEL || process.env.LOG_LEVEL || 'info'
    this.LOG_PRETTY = options.LOG_PRETTY || process.env.LOG_PRETTY || false
    this.middleware = {
      env: [ ],
      start: [ ],
      request: [ ],
      error: [ ],
      teardown: [ ]
    }
    this.started = false
    this.setExpiration(options.expiry || 0)
    // CONSIDER: should we instead init this with NODE_ENV and LOG_LEVEL?
    this.environment = { }
    this.logger = options.logger || new ConsoleLogger({ LOG_LEVEL: this.LOG_LEVEL, LOG_PRETTY: this.LOG_PRETTY })
  }

  // CONFIGURATION 

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
    // if (obj.env && isFunction(obj.env)) this.env(obj.env.bind(obj))
    // if (obj.start && isFunction(obj.start)) this.start(obj.start.bind(obj))
    // if (obj.request && isFunction(obj.request)) this.request(obj.request.bind(obj))
    // if (obj.error && isFunction(obj.error)) this.error(obj.error.bind(obj))
    // if (obj.teardown && isFunction(obj.teardown)) this.teardown(obj.teardown.bind(obj))
  }

  useFunction(fn, meta) {
    if (!isFunction(fn)) throw new Error("Middleware must be a function!")
    meta = meta || { }
    if (!meta.lifecycle || !LIFECYCLES.includes(meta.lifecycle)) throw new Error("Middleware lifecycle has invalid value: ${meta.lifecycle}")
    this.middleware[meta.lifecycle].push(fn)
  }

  // TODO: This is kind of weird, only needed to support arrays
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
    try {
      if (this.isColdStart() || options.forceColdStart) {
        ctx.state.coldstart = true
        ctx.logger.trace('--------------- ENV BEGIN ---------------')
        await this.invokeEnv(ctx)
        // CONSIDER: should we do an Object.assign(this.environment, ctx.env)
        // so that previous values in this.environment are retained if not overwritten by ctx.env?
        // e.g. NODE_ENV and LOG_LEVEL
        this.environment = ctx.env
        ctx.logger.trace(`ctx.env=${JSON.stringify(ctx.env, null, 2)}`)
        ctx.logger.trace('--------------- ENV END ---------------')
        ctx.logger.trace('--------------- START BEGIN ---------------')
        await this.invokeStart(ctx)
        ctx.logger.trace('--------------- START END ---------------')
      } else {
        ctx.state.coldstart = false
        ctx.env = this.environment
      }
      ctx.logger.trace('--------------- REQUEST BEGIN ---------------')
      await this.invokeRequest(ctx)
      ctx.logger.trace('--------------- REQUEST END ---------------')
    } catch (err) {
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
    return ctx.response
  }

  async invokeEnv(ctx) {
    this.initCtx(ctx)
    ctx.logger.meta({ lifecycle: 'env' })
    return compose(this.middleware['env'])(ctx)
  }

  async invokeStart(ctx) {
    this.initCtx(ctx)
    ctx.logger.meta({ lifecycle: 'start' })
    this.started = true
    if (this.isExpired()) {
      this.setExpiration(this.expiry)
    }
    return compose(this.middleware['start'])(ctx)
  }

  async invokeRequest(ctx) {
    this.initCtx(ctx)
    ctx.logger.meta({ lifecycle: 'request' })
    return compose(this.middleware['request'])(ctx)
  }

  // The theory is that we only get here for unhandled errors
  // since all MW and user can handle errors using try catch
  // This is only called when unhandled error bubbles up
  async invokeError(ctx) {
    this.initCtx(ctx)
    ctx.logger.meta({ lifecycle: 'error' })
    if (this.NODE_ENV != 'production') {
      // if we are not in production mode then expose 
      // the error message and stack trace
      if (ctx.error) {
        ctx.error.expose = true
        ctx.error.stacktrace = true
      }
    }
    return compose(this.middleware['error'])(ctx)
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


// Default Console Logger

const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
}

const NAMES = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal'
}

class ConsoleLogger {

  constructor(options) {
    options = options || { }
    this.lev = options.LOG_LEVEL && LEVELS[options.LOG_LEVEL] || LEVELS['info']
    this.metadata = { }
    this.pretty = (options.LOG_PRETTY === 'true') || (options.LOG_PRETTY === true)
    if (this.pretty) {
      this.prettify = options.prettify || prettify
    }
    this.console = console
  }

  level(name) {
    if (name) {
      this.lev = LEVELS[name]
    }
    return NAMES[this.lev]
  }

  meta(metadata, options) {
    options = options || { }
    if (metadata === false) {
      this.metadata = { }
    } else if (!metadata) {
      // noop
    } else if (options.replace) {
      this.metadata = metadata
    } else {
      Object.assign(this.metadata, metadata)
    }
    return this.metadata
  }

  trace(...args) {
    if (this.lev > LEVELS['trace']) return
    this.mergeMetadata(args, this.metadata, { level: 'trace', leveln: LEVELS['trace'] })
    // we deliberatly use 'console.debug' because 'console.trace' prints a stack trace out
    this.console.debug(...args) 
    return args
  }

  debug(...args) {
    if (this.lev > LEVELS['debug']) return
    this.mergeMetadata(args, this.metadata, { level: 'debug', leveln: LEVELS['debug']})
    this.console.debug(...args)
    return args
  }

  info(...args) {
    if (this.lev > LEVELS['info']) return
    this.mergeMetadata(args, this.metadata, { level: 'info', leveln: LEVELS['info'] })
    this.console.info(...args)
    return args
  }

  warn(...args) {
    if (this.lev > LEVELS['warn']) return
    this.mergeMetadata(args, this.metadata, { level: 'warn', leveln: LEVELS['warn'] })
    this.console.warn(...args)
    return args
  }

  error(...args) {
    if (this.lev > LEVELS['error']) return
    this.mergeMetadata(args, this.metadata, { level: 'error', leveln: LEVELS['error'] })
    this.console.error(...args)
    return args
  }

  fatal(...args) {
    if (this.lev > LEVELS['fatal']) return
    this.mergeMetadata(args, this.metadata, { level: 'fatal', leveln: LEVELS['fatal'] })
    this.console.fatal(...args)
    return args
  }

  mergeMetadata(args, metadata, standard, options) {
    options = options || { }
    standard.time = Date.now()
    switch(typeof args[0]) {
      case 'string':
        // TODO: could support console.log('a', 1) => 'a 1' by merging all args as the string msg
        args[0] = Object.assign(standard, metadata, { msg: args[0] })
        break
      case 'object': 
        if (args[0] instanceof Error) {
          args[0] = {
            msg: args[0].stack
          }
        }
        // we don't want to mutate the object in args[0]
        args[0] = Object.assign({}, standard, metadata, args[0])
        break
      default:
        break
    }
    if (this.pretty || options.pretty) {
      args[0] = this.prettify(args[0])
    }
    return args
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


// Based pino's pretty format:
// [2019-05-04 18:05:57.530 +0000] INFO (49248 on Daniels-MacBook-Pro.local): plain message
//   duration: 3
//   execution: 0
//   component: "PinoLogger:request"
function prettify(line, options) {
  options = options || { }
  let d = new Date(line.time)
  let msg = `[${formatDate(d)}] ${line.level.toUpperCase()} (${formatFunctionInfo(line)}): ${line.msg}`
  let copy = JSON.parse(JSON.stringify(line));
  [ 'msg', 'level', 'leveln', 'time' ].forEach((key) => { delete copy[key] })
  let propstr = JSON.stringify(copy, null, 4).trim().replace(/[{}]/g, '').replace(/\"([^(\")"]+)\":/g,"$1:")
  return `${msg}${propstr}`
}

function formatDate(d) {
  let month = ("0" + (d.getMonth() + 1)).slice(-2)
  let date = ("0" + d.getDate()).slice(-2)
  let time = formatTime(d)
  return `${d.getFullYear()}-${month}-${date} ${time} ${formatTz(d)}`
}

function formatTime(d) {
  var hours   = d.getHours()
  var minutes = d.getMinutes()
  var seconds = d.getSeconds()
  var milliseconds = d.getMilliseconds()

  if (hours   < 10) hours = "0"+hours
  if (minutes < 10) minutes = "0"+minutes
  if (seconds < 10) seconds = "0"+seconds
  if (milliseconds < 10) milliseconds = "00"+milliseconds
  if (milliseconds < 100) milliseconds = "0"+milliseconds
  return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

function formatTz(d) {
  let hours = ("0" + (d.getTimezoneOffset() / 60)).slice(-2)
  let minutes = ("0" + (d.getTimezoneOffset() % 60)).slice(-2)
  let plusminus = (d.getTimezoneOffset() >= 0) ? '+' : '-'
  return `${plusminus}${hours}${minutes}`
}

function formatFunctionInfo(line) {
  let awsRequestId = line.awsRequestId || "awsRequestId"
  let functionName = line.functionName || "function"
  let functionVersion = line.functionVersion || "version"
  return `${awsRequestId} on ${functionName}:${functionVersion}`
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
    component: getComponentName(fn),
    tbmw: Date.now(),
    tbnmw: 0,
    tanmw: 0,
    tamw: 0
  }
  ctx.stack.push(meta)
  ctx.logger.meta({ component: meta.component })
  ctx.logger.trace(`BEGIN: ${meta.component}`)
}

function afterMiddleware(ctx, fn, i) {
  let meta = ctx.stack.pop()
  meta.tamw = Date.now()
  let duration = meta.tamw - meta.tbmw
  let execution = duration
  if (meta.tbnmw > 0 && meta.tanmw > 0) {
    execution = (meta.tbnmw - meta.tbmw) + (meta.tamw - meta.tanmw)
  }
  ctx.logger.trace({ msg: `END: ${meta.component}`, duration, execution })
}

function beforeNextMiddleware(ctx, fn, i) {
  let meta = ctx.stack[ctx.stack.length - 1]
  meta.tbnmw = Date.now()
}

function afterNextMiddleware(ctx, fn, i) {
  let meta = ctx.stack[ctx.stack.length - 1]
  meta.tanmw = Date.now()
  ctx.logger.meta({ component: meta.component })
}

// Create the default instance to be exported
let func = createInstance()

// Expose Func class
func.Func = Func

// Expose ConsoleLogger class
func.ConsoleLogger = ConsoleLogger

// Expose compose 
func.compose = compose

// Factory for creating new instances
func.create = createInstance


module.exports = func