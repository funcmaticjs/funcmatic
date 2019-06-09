const f = require('../lib/func')
const compose = f.compose

describe('Compose', () => {
  let ctx = null
  beforeEach(async () => {
    ctx = { 
      logger: new f.LoggerWrapper({ LOG_LEVEL: process.env.LOG_LEVEL })
    }
  })
  it ('should set the logger metadata', async () => {
    let plugin = new MyPlugin()
    plugin.request["_plugin"] = plugin.constructor.name
    let mw = compose([ mw0, mw1, plugin.request, async (ctx) => {
      expect(ctx.stack.length).toBe(4)
      expect(ctx.stack[0]).toMatchObject({
        src: "AsyncFunction:mw0",
        tbmw: expect.anything(),
        tbnmw: expect.anything(),
        tanmw: 0,
        tamw: 0
      })
      expect(ctx.stack[1]).toMatchObject({
        src: "AsyncFunction:mw1",
        tbmw: expect.anything(),
        tbnmw: expect.anything(),
        tanmw: 0,
        tamw: 0
      })
      expect(ctx.stack[2]).toMatchObject({
        src: "MyPlugin:request",
        tbmw: expect.anything(),
        tbnmw: expect.anything(),
        tanmw: 0,
        tamw: 0
      })
      expect(ctx.stack[3]).toMatchObject({
        src: "AsyncFunction:[anonymous]",
        tbmw: expect.anything(),
        tbnmw: 0,
        tanmw: 0,
        tamw: 0
      })
      expect(ctx.logger.state()).toMatchObject({
        src: 'AsyncFunction:[anonymous]'
      })

      // Verify that our timers are called in the correct sequence
      expect(ctx.stack[0].tbmw).toBeLessThan(ctx.stack[0].tbnmw)
      expect(ctx.stack[0].tbnmw).toBeLessThanOrEqual(ctx.stack[1].tbmw)
      expect(ctx.stack[1].tbmw).toBeLessThan(ctx.stack[1].tbnmw)
      expect(ctx.stack[1].tbnmw).toBeLessThanOrEqual(ctx.stack[2].tbmw)
      expect(ctx.stack[2].tbmw).toBeLessThan(ctx.stack[2].tbnmw)
      expect(ctx.stack[2].tbnmw).toBeLessThanOrEqual(ctx.stack[3].tbmw)
      expect(ctx.stack[3].tbnmw).toBeLessThan(ctx.stack[3].tbmw)

      await wait(200)
    } ])
    await mw(ctx)
    // everything should be popped off
    expect(ctx.stack.length).toBe(0)
  })
  it ('should throw if not given an array', async () => {
    let error = null
    try {
      compose(mw0)
    } catch (err) {
      error = err
    }
    expect(error).toBeTruthy()
    expect(error.message).toEqual("Middleware stack must be an array!")
  })
  it ('should throw if not given an array of functions', async () => {
    let error = null
    try {
      compose([ mw1, { hello: "world" } ])
    } catch (err) {
      error = err
    }
    expect(error).toBeTruthy()
    expect(error.message).toEqual("Middleware must be composed of functions!")
  })
  it ('should throw if middleware call next twice', async () => {
    let stack = compose([ mw1, multiplenext ])
    let error = null
    try {
      await stack(ctx)
    } catch (err) {
      error = err
    }
    expect(error).toBeTruthy()
    expect(error.message).toEqual("next() called multiple times")
  })
})

async function mw0(ctx, next) {
  expect(ctx.logger.state()).toMatchObject({
    src: 'AsyncFunction:mw0'
  })
  await wait(100)
  await next()
  expect(ctx.logger.state()).toMatchObject({
    src: 'AsyncFunction:mw0'
  })
  let stack = ctx.stack[ctx.stack.length-1]
  expect(stack).toMatchObject({
    src: 'AsyncFunction:mw0',
    tbmw: expect.anything(),
    tbnmw: expect.anything(),
    tanmw: expect.anything(),
    tamw: 0
  })
  expect(stack.tbnmw).toBeLessThan(stack.tanmw)
  await wait(100)
}

async function mw1(ctx, next) {
  expect(ctx.logger.state()).toMatchObject({
    src: 'AsyncFunction:mw1'
  })
  await wait(100)
  await next()
  expect(ctx.logger.state()).toMatchObject({
    src: 'AsyncFunction:mw1'
  })
  expect(ctx.stack[ctx.stack.length-1]).toMatchObject({
    src: 'AsyncFunction:mw1',
    tbmw: expect.anything(),
    tbnmw: expect.anything(),
    tanmw: expect.anything(),
    tamw: 0
  })
  await wait(100)
}

async function multiplenext(ctx, next) {
  await next()
  await next()
}

class MyPlugin {
  async env(ctx, next) {
    await next()
  }
  async start(ctx, next) {
    await next()
  }
  async request(ctx, next) {
    expect(ctx.logger.state()).toMatchObject({
      src: 'MyPlugin:request'
    })
    await wait(100)
    await next()
    expect(ctx.logger.state()).toMatchObject({
      src: 'MyPlugin:request'
    }) 
    expect(ctx.stack[ctx.stack.length-1]).toMatchObject({
      src: 'MyPlugin:request',
      tbmw: expect.anything(),
      tbnmw: expect.anything(),
      tanmw: expect.anything(),
      tamw: 0
    })
    await wait(100)
  }
}

class MyOtherPlugin {
  async env(ctx, next) {
    await next()
  }
  async start(ctx, next) {
    await next()
  }
  async request(ctx, next) {
    await next()
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
