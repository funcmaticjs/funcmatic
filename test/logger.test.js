const f = require('../lib/func')

describe('Logger Fields', () => {
  let logger = null
  beforeEach(async () => {
    logger = new f.LoggerWrapper()
  })
  it ('should set state fields', async () => {
    logger.state({ meta: 'data' })
    expect(logger.state()).toMatchObject({
      meta: 'data'
    })
  })
  it ('should clear state fields', async () => {
    logger.state({ meta: 'data' })
    logger.state(null) // this won't clear it because value must be false
    expect(logger.state()).toMatchObject({
      meta: 'data'
    })
    logger.state(false) 
    expect(logger.state()).toEqual({})
  })
  it ('should replace state fields', async () => {
    logger.state({ meta: 'data', hello: 'world' })
    logger.state({ foo: 'bar' }, { replace: true })
    expect(logger.state()).toEqual({
      foo: 'bar'
    })
  })
  it ('should merge state fields in plain string log message', async () => {
    logger.state({ meta: 'data' })
    expect(JSON.parse(logger.info("hello world"))).toMatchObject({
      meta: 'data',
      msg: 'hello world'
    })
  })
  it ('should set env fields', async () => {
    logger.env({ meta: 'data' })
    expect(logger.env()).toMatchObject({
      meta: 'data'
    })
  })
  it ('should clear state fields', async () => {
    logger.env({ meta: 'data' })
    logger.env(null) // this won't clear it because value must be false
    expect(logger.env()).toMatchObject({
      meta: 'data'
    })
    logger.env(false) 
    expect(logger.env()).toEqual({})
  })
  it ('should replace state fields', async () => {
    logger.env({ meta: 'data', hello: 'world' })
    logger.env({ foo: 'bar' }, { replace: true })
    expect(logger.env()).toEqual({
      foo: 'bar'
    })
  })
  it ('should merge state fields in plain string log message', async () => {
    logger.env({ meta: 'data' })
    expect(JSON.parse(logger.info("hello world"))).toMatchObject({
      meta: 'data',
      msg: 'hello world'
    })
  })
})

describe('Messages', () => {
  let logger = null
  beforeEach(async () => {
    logger = new f.LoggerWrapper()
  })
  it ("should set standard fields 'level' and 'time' in the log message", async () => {
    expect(JSON.parse(logger.info('hello world'))).toMatchObject({
      level: 30,
      level_name: 'info',
      time: expect.anything()
    })
    expect(JSON.parse(logger.error('error!'))).toMatchObject({
      level: 50,
      level_name: 'error', 
      time: expect.anything()
    })
  })
  it ('should merge metadata in an object log message', async () => {
    logger.state({ meta: 'data' })
    expect(JSON.parse(logger.info({ hello: 'world' }))).toMatchObject({
      meta: 'data',
      hello: 'world'
    })
  })
})

describe('Levels', () => { 
  let logger = null
  beforeEach(async () => {
    logger = new f.LoggerWrapper()
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
  it ("should log trace level", async () => {
    expect(logger.trace("should NOT be logged")).toBeFalsy()
    logger.level('trace')
    expect(logger.trace("should be logged")).toBeTruthy()
  })
  it ("should log debug level", async () => {
    logger.level('info')
    expect(logger.debug("should NOT be logged")).toBeFalsy()
    logger.level('debug')
    expect(logger.debug("should be logged")).toBeTruthy()
  })
  it ("should log info level", async () => {
    logger.level('warn')
    expect(logger.info("should NOT be logged")).toBeFalsy()
    logger.level('info')
    expect(logger.info("should be logged")).toBeTruthy()
  })
  it ("should log warn level", async () => {
    logger.level('error')
    expect(logger.warn("should NOT be logged")).toBeFalsy()
    logger.level('warn')
    expect(logger.warn("should be logged")).toBeTruthy()
  })
  it ("should log error level", async () => {
    logger.level('fatal')
    expect(logger.error("should NOT be logged")).toBeFalsy()
    logger.level('error')
    expect(logger.error("should be logged")).toBeTruthy()
  })
  it ("should log fatal level", async () => {
    logger.level('off')
    expect(logger.fatal("should NOT be logged")).toBeFalsy()
    logger.level('fatal')
    expect(logger.fatal("should be logged")).toBeTruthy()
  })  
})

describe('Logging Errors', () => {
  let logger = null
  beforeEach(async () => {
    logger = new f.LoggerWrapper()
  })
  it ("should log error objects", async () => {
    logger.error(new Error("my error"))
  })
})

describe('Prettify', () => {
  let logger = null 
  beforeEach(async () => {
    logger = new f.LoggerWrapper({ prettify: (line) => {
      return `PRETTY: ${line.msg}`
    }})
  })
  it ("should print pretty logs", async () => {
    let line = logger.info("hello world")
    expect(line).toEqual("PRETTY: hello world")
  })
})