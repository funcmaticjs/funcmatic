
[![Funcmatic Serverless Middlew Framework for AWS Lambda](https://funcmaticjs.com/img/Logo@2x.png)](http://funcmaticjs.com)

## Introduction

Funcmatic helps you develop more complex serverless functions that respond to web requests. What [Express](https://github.com/expressjs/express) is for building Node.js web servers, Funcmatic is for building Node.js web functions with AWS API Gateway and Lambda. 
 
### Key Features
 
- Organize function logic into distinct lifecycle handlers.
- Create and reuse middleware across functions.
 
### Lightweight Approach


- The core framework is a single file less than 400 lines.
- Vanilla Javascript and does not use any Node specific modules (e.g. net/http, os, fs).
- **No additional packages or dependencies!** 

Funcmatic is able to be so lightweight because it:

- Only supports a single [AWS Lambda Runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html): Node 8.10 (async/await).
- Does not alter, wrap, or abstract the raw AWS event and context objects.
- Does not dictate the response format.
- Does not help with packaging, deployment, provisioning, configuration.
- Has no aspirations to support “multi-cloud” environments (e.g. Azure Functions, Google Cloud Functions).

### Compatibility with Other Frameworks

Because Funcmatic only focuses on helping you organize the internal logic of your function, it works great with other serverless frameworks that help with packaging, configuration, and deployment (e.g. [Serverless Framework](https://github.com/serverless/serverless), [AWS SAM CLI](https://github.com/awslabs/aws-sam-cli)).

### Alternatives to Funcmatic

If Funcmatic doesn't quite suit your project (or your tastes) here are some other projects that might be useful:
* [serverless-http](https://github.com/dougmoscrop/serverless-http): Use your existing middleware framework (e.g. Express, Koa) in AWS Lambda.
* [serverless-compose](https://github.com/DavidJFelix/serverless-compose): A lightweight middleware framework for AWS lambda.
* [Middy](https://github.com/middyjs/middy): The stylish Node.js middleware engine for AWS Lambda.
* [Lambcycle](https://github.com/juliantellez/lambcycle): Lambcycle is a declarative lambda middleware. Its main purpose is to let you focus on the specifics of your application by providing a configuration cycle.
* [Lambda API](https://github.com/jeremydaly/lambda-api): Lightweight web framework for your serverless applications.


## Installation

Funcmatic requires **node v8.10** or higher. 

```
$ npm install @funcmaticjs/funcmatic
```

## Hello World

```js
const func = require('@funcmaticjs/funcmatic')

func.request(async ctx => {
  // Response formatted according to API Gateway's Lambda Proxy Integration 
  ctx.response = {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ hello: "world" })
  }
})

module.exports = {
  lambdaHandler: func.handler() // async (event, context) => { ... }
}
```

## Getting started

Checkout some of the commented [examples](https://github.com/funcmaticjs/examples) below to get a feel for what Funcmatic functions look like:

* [Hello World](https://github.com/funcmaticjs/examples/tree/master/helloworld)
* More examples coming soon ...


## Lifecycle Handlers

AWS Lambda gives a [single entrypoint](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html) to execute all of our function's logic.

```js
// Standard AWS Lambda Handler
module.exports.lambdaHandler = async function(event, context) {
  // ... all your function code  
  return "some success message"
  // or 
  // throw new Error("some error type"); 
}
```

When creating more complex functions we often want particular logic to be executed only in particular cirumstances. For example, we might want to fetch environment variables or create a database connection only when a function is cold started. 

Funcmatic gives you *multiple entrypoints* so that you can predictably trigger specific logic for different stages of your function's lifecycle.

### 1. env handler

The purpose of the env handler is to fetch all necessary configuration values and set them in the `ctx.env` object. The `ctx.env` object will persist in memory across subsequent invocations of this function.

The env handler is the first of the four handlers to be invoked. It is only invoked during a cold start.

*Logic that might be executed by your env handler:*

- Decrypt encrypted AWS Lambda environment variables.
- Download and parse a config file stored in AWS S3.
- Fetch environment variables stored in AWS Parameter Store.

*Sample code:*

```js
// The async function you pass to "func.env" will be
// called during the "env" lifecycle stage. 
func.env(async (ctx) => {
  // A typical thing to do in our env handler is to 
  // fetch environment variables.
  let vars = await fetchEnvVarsFromSomewhere()
  // It's Funcmatic convention to set these
  // values in the ctx.env object which persists 
  // over invocations of this function.
  // We can access ctx.env.DB_CONNECTION_URI on 
  // subsequent invocations of this function.
  ctx.env.DB_CONNECTION_URI = vars.DB_CONNECTION_URI 
  // Once all the config values our function
  // needs is set in ctx.env we can return from 
  // this handler.
  return
})
```

### 2. start handler

The purpose of the start handler is to perform all the necessary initialization of your function before core business logic can be executed. Oftentimes, this initialization is expensive and we want it to run only once when the function is cold started. A common use case of the start handler is connecting to a database.

The start handler is executed immediately after the env handler. As such, it has access to all the configuration values stored in `ctx.env` by the env handler. Like the env handler it only is invoked during a cold start. 


*Logic that might be executed by your start handler:*

- Open and cache database connections
- Fetch and parse a CSV data file
- Set default values of your http request library (e.g. Base URLs of API endpoints, Authorization tokens, )

*Sample code:*

```js
// The async function you pass to "func.start" will be
// called during the "start" lifecycle stage.
func.start(async (ctx) => {
  // Our env handler set DB_CONNECTION_URI in ctx.env
  // so we just read it out here.
  let uri = ctx.env.DB_CONNECTION_URI
  // We use this value to create a database connection
  // which takes a lot of time.
  // Since we want this db connection to stay 
  // open across multiple invocations ("cached")
  // we set it in "ctx.env"
  ctx.env.db = await connectToSomeDB(uri)
  // This is all the initialization our function needs 
  // so we return
  return
})
```

### 3. request handler

The purpose of the request handler is to to perform the majority of our function's **business logic** and **return the response** to the client. Ideally, all configuration and initialization were completed by our env* and start handlers and our request handler can just focus on the logic that makes this function unique and valuable.

The request handler will often make use of the `ctx.event` and `ctx.context` objects which store the unadulterated namesake objects provided by AWS Lambda.

Unlike the env and start handlers which are only executed on cold start, the request handler is executed *every time* the function is invoked. During a cold start it will run immediately after the env and start handlers. During a warm start it will be the first handler to be executed.

*Logic that might be executed by your request handler:*

- Perform database operations (i.e. read/writes/deletes)
- Make API requests to other services
- Authorize and authenticate requests (e.g. validate JWT tokens)
- Format the client response 

*Sample code:*

```js
// The async function you pass to "func.request" 
// will be called during the "request" lifecycle stage.
func.request(async (ctx) => {
  // We fetch the HTTP query param "name" from the 
  // AWS API Gateway Lambda Proxy Integration event 
  let name = ctx.event.queryStringParams.name || '*'
 
  // We can use the open db connection that was 
  // "cached" in ctx.env by our start handler to 
  // execute a query based on the "name" param.
  let db = ctx.env.db
  let data = await db.query({ name })

  // We return the data to client by setting
  // "ctx.response" to be an object with structure 
  // expected by API Gateway's Lambda Proxy 
  // Integration.
  ctx.response = {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(data),
    isBase64Encoded: false
  }
  // Note that we don't actually return the response
  // in the request handler. "ctx.response" is what
  // the client will receive.
  return
})
```

### 4. error handler

The purpose of the error handler is to deal with **uncaught errors** that interrupted the execution of our env, start, or request handler. In other words, it is the error handler *of last resort* in our function. `ctx.error` is where you can access the uncaught error object. 

Our error handler will not be executed if there are no uncaught errors.

*Logic that might be executed by your error handler:*

- Log error to the console (i.e. Cloudwatch Logs)
- Call an error notification service (e.g. PageDuty, Airbrake)
- Return a standard error response to the user
- Clean up any initialized resources

*Sample code:*

```js
// The async function you pass to "func.error" 
// will be called during the "error" lifecycle stage.
func.error(async (ctx) => {
  // The uncaught error is available in ctx.error
  let error = ctx.error
  
  // Let's log the error the console so it 
  // shows up in Cloudwatch Logs. 
  // "ctx.logger" is the Funcmatic default logger
  ctx.logger.error(error)

  // We return an response to the user with our error message
  let message = `Sorry there was an error! (${ctx.error.message})`
  ctx.respose = {  
    statusCode: 500, // Internal server error
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ message }),
    isBase64Encoded: false
  }
  return
})
```

### 5. teardown handler

The teardown handler is a *pseudo handler* because it is never called when our function is invoked by AWS Lambda. 

So why do we have a teardown handler?

It helps when unit testing our function to clean up any resources that our function might be hanging on to after invocation. For example, if we are caching a database connection, our unit test needs close the connection before ending the test and moving on to another.

*Logic that might be executed by your teardown handler:*

- Close open database connections and files. 
- Let go (i.e. "null out") any large data objects held in memory.
- Reset your function back to an uninitialized state.

*Sample code:*

```js
// The async function you pass to "func.teardown" 
// will be called when you manually invoke 
// the teardown lifecycle handler 
// i.e. calling "func.invokeTeardown()"
func.teardown(async (ctx) => {
  // If we have a db connection, close it
  if (ctx.env.db) {
    await ctx.env.db.close()   
  }
  // Reset all configuration
  ctx.env = { }
  // We have nothing more to cleanup so we return
  return
})
```

## Middleware

[Middleware graphic here]

One of the primary benefits of using Funcmatic is being able to package common logic into middleware and reuse it our functions.

Funcmatic's middleware design is based on [Koa.js](https://github.com/koajs/koa). One primary difference with Koa is that since each lifecycle handler has its own entrypoint of execution (i.e. env, start, request, error). This means that you can configure each lifecycle handler to have its own independent *middleware stack*.

### Middleware Functions

A *middleware stack* is a nested series of async functions with the following structure:

```js
async (ctx, next) => { 
  // All "downstream" middleware logic higher in the stack will have been executed
  // before this middleware  
  /* This middleware's "downstream" logic ... */ 
  await next() // invoke the next middleware function in the stack
  /* This middleware's "upstream" logic ... */
  return // any return value will be ignored
  // The next "upsteram" middleware logic higher in the stack will be invoked 
  // after this middleware finishes execution 
}
```

- `ctx`: middleware will often read and write values to the `ctx` object.
- `next`: an async function created and passed in by Funcmatic. All middleware functions ***must call `next` once and only once*** so that execution can continue to the next middleware function in the stack.

At the bottom of the stack is typically the *end-user function* which has the following structure:

```js
async (ctx) => {
  // All "downstream" middleware logic has executed by this time
  /* This end-user function's logic ... */
  return // any return value will be ignored
  // All "upstream" middleware logic will now begin execution
}
```

You will notice that the only difference is that *end-user function* does not accept (or invoke) the `next` function. It does not need to invoke the next function it is the last function in the stack and therefore does not have any functions to pass execution off to. 

The last function in the stack is the turning point in execution flows *downstream* to back *upstream*. 


#### Using Middleware Functions

To add a middleware function to a lifecycle's middleware stack, just pass the function to a call to `func.env`, `func.start`, `func.request`, `func.error`, `func.teardown`.

For example, 

#### Simple Examples of Middleware Functions

##### 1. AWS Event `queryStringParameters` normalizer

```js
// 1. define our middleware function
const queryStringParametersNormalizer = async (ctx, next) => {
  let event = ctx.event
  if (!event.queryStringParameters) {
    event.queryStringParameters = { }
  }
  await next()
  return
}
// 2. add it to the request middleware stack
func.request(queryStringParametersNormalizer)
```

##### 2. CORS Headers 

```js
func.request(async (ctx, next) => {
  await next()
  let response = ctx.response
  if (!response.headers["Access-Control-Allow-Origin"]) {
    response.headers["Access-Control-Allow-Origin"] = "*"
  }
  return
})
```

##### 3. Request Logger

```js
func.request(async (ctx, next) => {
  let t0 = Date.now()
  let event = ctx.event
  ctx.logger.info({ url: , t: t0 })
  await next()
  let t1 = Date.now()
  ctx.logger.info({ url: , t: t1, duration: (t1 - t0) })
  return
})
```



#### Downstream Execution

*Typical Examples of Downstream Middleware Logic*
- pre-proccessing the AWS `ctx.event` object 
- logging request
- validating and decoding JTW tokens 


#### Upstream Logic

*Typical Examples of Upstream Middleware Logic*
- post processing of the ctx.response object (e.g CORS headers) 
- logging of response times

### Middleware Plugins

Plugins are defined as Javascript classes that define one or more lifecycle-specific middleware functions. 


```js
class MyMiddlewarePlugin {

  env(ctx, next) { }
  start(ctx, next) { }
  request(ctx, next) { }
  error(ctx, next) { }
  teardown(ctx, next) { }
}

module.exports = MyMiddlewarePlugin
```



```
$> npm install '@funcmaticjs/response-plugin'
```

You can add plugins to your function's middleware stack by calling `use`:

```js
let func = require('@funcmaticjs/func')
let ResponsePlugin = require('@funcmaticjs/response-plugin')

// 
func.use(new ResponsePlugin())
```


### Creating and Using Custom Middleware Plugins


### Publishing Middleware Plugins


## Available Middleware

### Environment Variables and Config
* [LocalEnvPlugin](https://google.com): Automatically bring all `process.env` variables to `ctx.env`
* [StageVariablesPlugin](https://google.com): Set API Gateway Stage Variables in `ctx.env`
* [ParameterStorePlugin](https://google.com): Fetch environment variables from AWS Parameter Store and set them in `ctx.env`


### AWS Event and Context
* [EventHelperPlugin](https://google.com): Makes working with AWS API Gateway's Lambda Proxy Integration event a little more friendly.



### Authentication and Authorization
* [Auth0Plugin](https://google.com): Authenticate a token
* [Auth0CachePlugin](https://google.com):  

### Datastores
* DynamoDBCachePlugin: 
* MongoDBPlugin:
* MySQLPlugin:

### Response 
* [ResponsePlugin](https://github.com/funcmaticjs/response-plugin)
* More coming soon!

### Logging and Monitoring
* CorrelationPlugin
* EnableDebugPlugin





## Context (`ctx`)

### `ctx.event` 

### `ctx.response` 

### `ctx.env`

### `ctx.state`

### `ctx.coldstart`

### `ctx.logger` 


## Unit Testing

## Documentation

## Running tests
## Authors
## Community

# License
[MIT](https://github.com/koajs/koa/blob/master/LICENSE)



# scratch

### Middleware Functions

Functio
* env
    - Function 1
    - User env handler function
* start
    - Function 1
    - Function 2
    - User function
* request
    - Function 1
    - User function

```js
// Middleware async function which 
// parses the body as JSON 
async (ctx, next) {
  // Middleware logic to run BEFORE 

  // Middleware must call next() which invokes
  // the subsequent middleware (or user code) 
  // in the stack.
  await next()

  // Middleware logic to run AFTER control is passed back
  // 
  // After this middleware returns, control will
  // be passed to the previous middleware
  return
}
```