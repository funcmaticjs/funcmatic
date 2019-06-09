const f = require('../lib/func')

describe('Metadata', () => {
  let logger = null
  beforeEach(async () => {
    logger = new f.ConsoleLogger()
  })
  it ('should set metadata', async () => {
    logger.meta({ meta: 'data' })
    expect(logger.meta()).toMatchObject({
      meta: 'data'
    })
  })
  it ('should clear metadata', async () => {
    logger.meta({ meta: 'data' })
    logger.meta(null) // this won't clear it because value must be false
    expect(logger.meta()).toMatchObject({
      meta: 'data'
    })
    logger.meta(false) 
    expect(logger.meta()).toEqual({})
  })
  it ('should replace metadata', async () => {
    logger.meta({ meta: 'data', hello: 'world' })
    logger.meta({ foo: 'bar' }, { replace: true })
    expect(logger.meta()).toEqual({
      foo: 'bar'
    })
  })
  it ('should merge metadata in plain string log message', async () => {
    logger.meta({ meta: 'data' })
    expect(logger.info("hello world")[0]).toMatchObject({
      meta: 'data',
      msg: 'hello world'
    })
  })
})

describe('Messages', () => {
  let logger = null
  beforeEach(async () => {
    logger = new f.ConsoleLogger()
  })
  it ("should set standard fields 'level' and 'time' in the log message", async () => {
    expect(logger.info('hello world')[0]).toMatchObject({
      level: 'info',
      leveln: 30,
      time: expect.anything()
    })
    expect(logger.error('error!')[0]).toMatchObject({
      level: 'error',
      leveln: 50, 
      time: expect.anything()
    })
  })
  it ('should merge metadata in an object log message', async () => {
    logger.meta({ meta: 'data' })
    expect(logger.info({ hello: 'world' })[0]).toMatchObject({
      meta: 'data',
      hello: 'world'
    })
  })
})

describe('Levels', () => { 
  let logger = null
  beforeEach(async () => {
    logger = new f.ConsoleLogger()
  })
  it ("should not log lower level messages based on level", async () => {
    expect(logger.debug('should NOT be logged')).toBeFalsy()
    expect(logger.info('should be logged')).toBeTruthy()

    logger.level('debug')
    expect(logger.level()).toEqual('debug')

    expect(logger.debug('should be logged now')).toBeTruthy()
  })
  it ("should support log level of 'off'", async () => {
    logger.level('off')
    expect(logger.level()).toEqual('off')
    expect(logger.fatal("should NOT be logged")).toBeFalsy()
  })
})

describe('Logging Errors', () => {
  let logger = null
  beforeEach(async () => {
    logger = new f.ConsoleLogger()
  })
  it ("should log error objects", async () => {
    logger.error(new Error("my error"))
  })
})

describe('Prettify', () => {
  let logger = null 
  beforeEach(async () => {
    logger = new f.ConsoleLogger({ prettify: (line) => {
      return `PRETTY: ${line.msg}`
    }})
  })
  it ("should print pretty logs", async () => {
    let ret = logger.info("hello world")
    expect(ret[0]).toEqual("PRETTY: hello world")
  })
})