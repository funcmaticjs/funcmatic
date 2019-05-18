const f = require('../lib/func')
const compose = f.compose

describe('Compose', async () => {
  let ctx = null
  beforeEach(async () => {
    ctx = { 
      logger: new f.ConsoleLogger({ LOG_LEVEL: process.env.LOG_LEVEL })
    }
  })
  it ('should set the logger metadata', async () => {
    let plugin = new MyPlugin()
    plugin.request["_plugin"] = plugin.constructor.name
    let mw = compose([ mw0, mw1, plugin.request, async (ctx) => {
      expect(ctx.stack.length).toBe(4)
      expect(ctx.stack[0]).toMatchObject({
        component: "AsyncFunction:mw0",
        tbmw: expect.anything(),
        tbnmw: expect.anything(),
        tanmw: 0,
        tamw: 0
      })
      expect(ctx.stack[1]).toMatchObject({
        component: "AsyncFunction:mw1",
        tbmw: expect.anything(),
        tbnmw: expect.anything(),
        tanmw: 0,
        tamw: 0
      })
      expect(ctx.stack[2]).toMatchObject({
        component: "MyPlugin:request",
        tbmw: expect.anything(),
        tbnmw: expect.anything(),
        tanmw: 0,
        tamw: 0
      })
      expect(ctx.stack[3]).toMatchObject({
        component: "AsyncFunction:[anonymous]",
        tbmw: expect.anything(),
        tbnmw: 0,
        tanmw: 0,
        tamw: 0
      })
      expect(ctx.logger.meta()).toMatchObject({
        component: 'AsyncFunction:[anonymous]'
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
})

describe('Func Plugins', async () => {
  let func = null
  let ctx = null
  beforeEach(async () => {
    func = f.create()
    func.plugin(new MyPlugin())
    func.plugin(new MyOtherPlugin())
    ctx = { }
  })
  it ('should do the right thing', async () => {
    await func.invoke(ctx)
  })
})


async function mw0(ctx, next) {
  expect(ctx.logger.meta()).toMatchObject({
    component: 'AsyncFunction:mw0'
  })
  await wait(100)
  await next()
  expect(ctx.logger.meta()).toMatchObject({
    component: 'AsyncFunction:mw0'
  })
  let stack = ctx.stack[ctx.stack.length-1]
  expect(stack).toMatchObject({
    component: 'AsyncFunction:mw0',
    tbmw: expect.anything(),
    tbnmw: expect.anything(),
    tanmw: expect.anything(),
    tamw: 0
  })
  expect(stack.tbnmw).toBeLessThan(stack.tanmw)
  await wait(100)
}

async function mw1(ctx, next) {
  expect(ctx.logger.meta()).toMatchObject({
    component: 'AsyncFunction:mw1'
  })
  await wait(100)
  await next()
  expect(ctx.logger.meta()).toMatchObject({
    component: 'AsyncFunction:mw1'
  })
  expect(ctx.stack[ctx.stack.length-1]).toMatchObject({
    component: 'AsyncFunction:mw1',
    tbmw: expect.anything(),
    tbnmw: expect.anything(),
    tanmw: expect.anything(),
    tamw: 0
  })
  await wait(100)
}

class MyPlugin {
  async env(ctx, next) {
    await next()
  }
  async start(ctx, next) {
    await next()
  }
  async request(ctx, next) {
    expect(ctx.logger.meta()).toMatchObject({
      component: 'MyPlugin:request'
    })
    await wait(100)
    await next()
    expect(ctx.logger.meta()).toMatchObject({
      component: 'MyPlugin:request'
    }) 
    expect(ctx.stack[ctx.stack.length-1]).toMatchObject({
      component: 'MyPlugin:request',
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
