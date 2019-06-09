const f = require('../lib/func')

describe('Middleware', () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = new f.Func()
    ctx = { }
  })
  it ('should throw if use is given invalid plugin', async () => {
    let error = null
    try {
      func.use(new InvalidMW())
    } catch (err) {
      error = err
    }
    expect(error).toBeTruthy()
    expect(error.message).toEqual("Must provide a plugin, function, or array of plugins/functions")
  })
  it ('should throw if plugin is given invalid plugin', async () => {
    let error = null
    try {
      func.plugin(new InvalidMW())
    } catch (err) {
      error = err
    }
    expect(error).toBeTruthy()
    expect(error.message).toEqual("Middleware must be a valid plugin!")
  })
  it ('should throw if middleware is not a function', async () => {
    let error = null
    try {
      func.request({ hello: "world" })
    } catch (err) {
      error = err
    }
    expect(error).toBeTruthy()
    expect(error.message).toEqual("Must provide a plugin, function, or array of plugins/functions")
  })
})

describe('Func Cold Start', () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = new f.create()
    ctx = { state: { } }
  })
  it ('should be cold start when func is created', async () => {
    expect(func.isColdStart()).toBeTruthy()
  })
  it ('should not be cold start after start is invoked', async () => {
    await func.invokeStart(ctx)
    expect(func.isColdStart()).toBeFalsy()
  })
  it ('should force a coldstart', async () => {
    await func.invoke(ctx)
    expect(ctx.state.coldstart).toBeTruthy()
    await func.invoke(ctx, { forceColdStart: true })
    expect(ctx.state.coldstart).toBeTruthy()
  })
  it ('should not be a cold start on the second call to invoke', async () => {
    ctx.state.n = 0
    func.start(async (ctx) => {
      ctx.state.n += 1
    })
    await func.invoke(ctx)
    expect(ctx.state.coldstart).toBe(true)
    expect(ctx.state.n).toBe(1)
    await func.invoke(ctx)
    expect(ctx.state.coldstart).toBe(false)
    expect(ctx.state.n).toBe(1)
  })
  it ('should be cold start if expired', async () => {
    func.setExpiration(50)
    await func.invoke(ctx)
    await wait(100)
    expect(func.isColdStart()).toBeTruthy()
  })
  it ('should adjust expiry after expired', async () => {
    func.setExpiration(50)
    await func.invoke(ctx)
    await wait(100)
    await func.invoke(ctx)
    let t = (new Date()).getTime()
    expect(func.expiresAt).toBeGreaterThan(t)
  })
  it ('should clear expiration if set to zero', async () => {
    func.setExpiration(50)
    await func.invoke(ctx)
    func.setExpiration(0)
    await wait(100)
    await func.invoke(ctx)
    expect(func.expiresAt).toBe(null)
  })
})

describe('Func Env', () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = new f.create()
    ctx = createEmptyCtx()
  })
  // Environment Variables
  it ('should init env as empty', async () => {
    await func.invokeEnv(ctx)
    expect(ctx.env).toEqual({ })
  })
  it ('should bring process.env using middleware', async () => {
    func.env(async (ctx, next) => {
      Object.assign(ctx.env, process.env)
      await next()
    })
    await func.invokeEnv(ctx)
    expect(ctx.env).toMatchObject({
      PATH: expect.anything()
    })
  })
  it ('should export stageVariables using middleware', async () => {
    func.env(async (ctx, next) => {
      if (ctx.event && ctx.event.stageVariables) {
        Object.assign(ctx.env, ctx.event.stageVariables)
      } 
      await next()
    })
    ctx.event.stageVariables = { ENV: 'development' }
    await func.invokeEnv(ctx)
    expect(ctx.env).toMatchObject({
      ENV: 'development'
    })
  })
})
describe('Func Start', () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = new f.create()
    ctx = createEmptyCtx()
  })
  // Basic execution
  it ('should set logger in ctx', async () => {
    await func.invokeStart(ctx)
    expect(ctx).toMatchObject({
      logger: expect.anything()
    })
  })
  it ('should call user func with no middleware', async () => {
    func.use([ new UserFunc() ])
    await func.invokeStart(ctx)
    expect(ctx.env).toMatchObject({
      user: true
    })
  })
  it ('should call start middleware', async () => {
    func.use([ new StartMW(), new UserFunc() ])
    await func.invokeStart(ctx)
    expect(ctx.env).toMatchObject({
      downstream: true,
      user: true,
      upstream: true
    })
  })
  // Error Handling
  it ('should throw a downstream middleware error', async () => {
    func.use([ new StartMW(), new DownstreamErrorMW(), new UserFunc() ])
    let error = null
    try {
      await func.invokeStart(ctx)
    } catch (err) {
      error = err
    }
    expect(error.message).toEqual("Downstream Error")
    // should have stopped execution of stack
    expect(ctx.user).toBeFalsy()
    expect(ctx.upstream).toBeFalsy()
  })

  it ('should throw an upstream middleware error', async () => {
    func.use([ new StartMW(), new UpstreamErrorMW(), new UserFunc() ])
    try {
      await func.invokeStart(ctx)
    } catch (err) {
      error = err
    }
    expect(error.message).toEqual("Upstream Error")
    // should have stopped execution of stack
    expect(ctx.env.user).toBeTruthy()
    expect(ctx.env.upstream).toBeFalsy()
  })
})

describe('Func Request', () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = new f.create()
    ctx = createEmptyCtx()
  })
  it ('should set logger in ctx', async () => {
    await func.invokeRequest(ctx)
    expect(ctx).toMatchObject({
      logger: expect.anything()
    })
  })
  it('should NOT set the response in the ctx', async () => {
    await func.invokeRequest(ctx)
    expect(ctx.response).toBeFalsy()
  })
})

describe('Func Error', () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = new f.create()
    ctx = createEmptyCtx()
  })
  it ('should just log if error handler throws error', async () => {
    func.request(async (ctx) => {
      throw new Error("Error from request handler")
    })
    func.error(async (ctx) => {
      throw new Error("Error from error handler")
    })
    await func.invoke(ctx)
  })
})

describe('Func Invoke', () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = new f.create()
    ctx = createEmptyCtx()
  })
  // User Handler 'this' State
  if ('should preserve this state if user func is object', async () => {
    func.use(new UserFunc())
    await func.invoke(ctx)
    expect(JSON.stringify(ctx.response.body)).toMatchObject({
      userstate: 1 // userstate is object variable stored in 'this'
    })
  })
  // Error handling
  it ('should set ctx.error if the error is unhandled', async () => {
    func.use([ new DownstreamErrorMW(), new UserFunc() ])
    await func.invoke(ctx)
    expect(ctx.error).toBeTruthy()
    expect(ctx.error.message).toEqual("Downstream Error")
  })
  it ('should expose message and stacktrace if not in production', async () => {
    func.use([ new DownstreamErrorMW(), new UserFunc() ])
    await func.invoke(ctx)
    expect(ctx.error.expose).toBeTruthy()
    expect(ctx.error.stacktrace).toBeTruthy()
  })
  it ('should not expose message or stacktrace if in production', async () => {
    func.NODE_ENV = 'production'
    func.use([ new DownstreamErrorMW(), new UserFunc() ])
    await func.invoke(ctx)
    expect(ctx.error.expose).toBeFalsy()
    expect(ctx.error.stacktrace).toBeFalsy()
  })
})

describe('Func Handler',() => {
  let func = null
  beforeEach(async () => {
    func = new f.create()
  })
  it ('should create a handler', async () => {
    func.use([ new UserFunc() ])
    let handler = await func.handler()
    let response = await handler({ }, { })
    expect(response).toMatchObject({
      statusCode: 200
    })
    expect(JSON.parse(response.body)).toMatchObject({
      hello: 'world'
    })
  })
})

describe('Func Teardown', () => {
  let func = null
  beforeEach(async () => {
    func = new f.create()
  })
  it ('should call teardown', async () => {
    let f = new UserFunc()
    func.use([ f ])
    await func.invokeTeardown()
    expect(f.teardowninvoked).toBeTruthy()
  })
  it ('should skip teardown if unimplemented', async () => {
    let f = new UserFunc()
    func.use([ new StartMW(), f ])
    await func.invokeTeardown()
    expect(f.teardowninvoked).toBeTruthy()
  })
  it ('should not stop teardown if middleware throws error', async () => {
    let f = new UserFunc()
    func.use([ new TeardownErrorMW(), f ])
    await func.invokeTeardown()
    expect(f.teardowninvoked).toBeTruthy()
  })
})

describe('Func Logger', () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = new f.create()
    ctx = createEmptyCtx()
  })
  it ('should initialize with logger with system metadata', async () => {
    expect(func.logger.meta()).toMatchObject({
      component: "funcmatic",
      lifecycle: "system"
    })
  })
  it ('should restore system metadata after env completes', async () => {
    func.env(async (ctx) => {
      expect(ctx.logger.meta()).toMatchObject({
        component: "AsyncFunction:[anonymous]",
        lifecycle: "env"
      })
    })
    await func.invokeEnv(ctx)
    expect(ctx.logger.meta()).toMatchObject({
      component: "funcmatic",
      lifecycle: "system"
    })
  })
  it ('should restore system metadata after start completes', async () => {
    func.start(async (ctx) => {
      expect(ctx.logger.meta()).toMatchObject({
        component: "AsyncFunction:[anonymous]",
        lifecycle: "start"
      })
    })
    await func.invokeStart(ctx)
    expect(ctx.logger.meta()).toMatchObject({
      component: "funcmatic",
      lifecycle: "system"
    })
  })
  it ('should restore system metadata after request completes', async () => {
    func.request(async (ctx) => {
      expect(ctx.logger.meta()).toMatchObject({
        component: "AsyncFunction:[anonymous]",
        lifecycle: "request"
      })
    })
    await func.invokeRequest(ctx)
    expect(ctx.logger.meta()).toMatchObject({
      component: "funcmatic",
      lifecycle: "system"
    })
  })
  it ('should restore system metadata after error completes', async () => {
    func.error(async (ctx) => {
      expect(ctx.logger.meta()).toMatchObject({
        component: "AsyncFunction:[anonymous]",
        lifecycle: "error"
      })
    })
    await func.invokeError(ctx)
    expect(ctx.logger.meta()).toMatchObject({
      component: "funcmatic",
      lifecycle: "system"
    })
  })
  it ('should not pretty print logs by default', async () => {
    func.request(async (ctx) => {
      let ret = ctx.logger.info("hello world")
      expect(ret[0]).toMatchObject({
        msg: "hello world"
      })
    })
    await func.invokeRequest(ctx)
  })
  it ('should pretty print logs if prettify function passed in', async () => {
    let fpretty = f.create({ prettify: (line) => {
      return `PRETTY: ${line.msg}`
    }})
    fpretty.request(async (ctx) => {
      let ret = ctx.logger.info("hello world")
      expect(ret[0]).toEqual("PRETTY: hello world")
    })
    await fpretty.invokeRequest(ctx)
  })
})

function createEmptyCtx() {
  return {
    event: { },
    context: { },
    state: { }
  }
}

class InvalidMW {

  async blah(ctx, next) {

  }
}

class StartMW {
  async start(ctx, next) {
    ctx.env.downstream = true
    await next()
    ctx.env.upstream = true
  }
}

class DownstreamErrorMW {
  async start(ctx, next) {
    throw new Error("Downstream Error")
  }
}

class UpstreamErrorMW {
  async start(ctx, next) {
    await next()
    throw new Error("Upstream Error")
  }
}

class TeardownErrorMW {
  async teardown(ctx, next) {
    throw new Error("Teardown Error")
    await next()
  }
}

class UserFunc {

  async start(ctx) {
    this.userstate = 1
    ctx.env.user = true
  }
  async request(ctx) {
    ctx.response = { 
      statusCode: 200,
      body: JSON.stringify({ hello: 'world', userstate: this.userstate })
    }
  }
  async teardown() {
    this.teardowninvoked = true
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
