
[![Funcmatic Serverless Middleware Framework for AWS Lambda](https://funcmaticjs.com/img/Logo@2x.png)](http://funcmaticjs.com)

[![npm version](https://badge.fury.io/js/%40funcmaticjs%2Ffuncmatic.svg)](https://badge.fury.io/js/%40funcmaticjs%2Ffuncmatic) [![codecov](https://codecov.io/gh/funcmaticjs/funcmatic/branch/master/graph/badge.svg)](https://codecov.io/gh/funcmaticjs/funcmatic)

## Contents

- [Introduction](#intro)
- [Installation](#install)
- [Lifecycle Handlers](#lifecycle)
- [Middleware](#middleware)
- [Testing](#testing)
- [Alternatives](#alternatives)

## <a name="intro"></a>Introduction

Funcmatic helps you develop more complex serverless functions that respond to web requests. What [Express](https://github.com/expressjs/express) is for building Node.js web servers, Funcmatic is for building Node.js web functions with AWS API Gateway and Lambda. 
 
#### Key Features
 
- Organize function logic into distinct lifecycle handlers.
- Create and reuse middleware across functions.
 
#### Lightweight Approach

- The core framework is a single file less than 400 lines.
- Vanilla Javascript and does not use any Node specific modules (e.g. net/http, os, fs).
- **No additional packages or dependencies!** 

Funcmatic is able to be so lightweight because it:

- Only supports a single [AWS Lambda Runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html): Node 8.10 (async/await).
- Does not alter, wrap, or abstract the raw AWS event and context objects.
- Does not dictate the response format.
- Does not help with packaging, deployment, provisioning, configuration.
- Has no aspirations to support “multi-cloud” environments (e.g. Azure Functions, Google Cloud Functions).

#### Compatibility with Other Frameworks

Because Funcmatic only focuses on helping you organize the internal logic of your function, it works great with other serverless frameworks that help with packaging, configuration, and deployment (e.g. [Serverless Framework](https://github.com/serverless/serverless), [AWS SAM CLI](https://github.com/awslabs/aws-sam-cli)).


## <a name="install"></a>Installation

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


## <a href="lifecycle"></a>Lifecycle Handlers

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

## <a name="intro"></a>Middleware

One of the primary benefits of using Funcmatic is being able to package common logic into middleware and reuse it our functions.

Funcmatic's middleware design is based on [Koa.js](https://github.com/koajs/koa). Since each lifecycle handler has its own entrypoint of execution (i.e. env, start, request, error), this means that each lifecycle handler can be configured with its own middleware stack. 

### Middleware Stack and Functions

A *middleware stack* is series of nested Javascript async functions. 


#### Flow of Execution In a Middleware Stack

The first (i.e. topmost) function is invoked by the Funcmatic framework directly. It is the first middleware function's responsibility to pass control to the second middleware function by calling `await next()`. `next` is a special callback async function created by Funcmatic and available all middleware functions.

The second function invokes the third, third invokes the fourth, and so on until we reach the last function in the stack which is typically where your function-specific logic lives. 

Since this last function is at the bottom of the stack, it does not need to call `next()` since there is no next function to pass control off to. It can simply `return` to end its own execution.

Now execution flows back up the stack in the reverse direction. The N-1 function was waiting on the last function to complete execution `await next()`. 

The N-1 function can now execute its own logic and then end its own execution and pass control to the N-2 function by calling `return` and so on until the second function returns and passes control back to the first function which was waiting for it via `await next()`.

#### Middleware Function Definition

Middleware functions are just async javascript functions that take two arguments: `ctx` and `next`.

- `ctx`: The context object which many middleware functions with read data from and also write data to. Since middleware functions don't directly pass arguments or return data directly to each other, `ctx` is the only way for as a side effect.  *See ctx documentation below for more details*. 
- `next`: an async function created and passed in by Funcmatic. All middleware functions ***must call `next` once and only once*** so that execution can continue to the next middleware function in the stack.

##### Code Structure of a Middleware Function

A middleware function has the following structure:
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

Since the last function (often our function's specific logic) does not have to invoke `await next()` it can have the structure below:

```js
async (ctx) => { // Note we don't need to accept the "next" parameter
  // All "downstream" middleware logic has executed by this time
  /* This end-user function's logic ... */
  return // any return value will be ignored
  // All "upstream" middleware logic will now begin execution
}
```

There are two useful terms to describe what happens in a specific middleware function:

- **Downstream Logic**: This is the code that executes in a middleware function *BEFORE* it calls `await next()` and pass control to the lower function in the stack.
- **Upstream Logic**: This is the code that executes in a middleware function *AFTER* it calls `awaits next()` and control returns as a result of the lower function completing execution via `return`.

*Downstream* and *Upstream* are relative terms. In Funcmatic we think of the user initiating a request to our API being the *topmost* and our function-specific logic being *bottommost*. Therefore execution first makes its way downstream from the user, through our middleware stack, to our function specific logic. And then back *upstream* through our middleware stack and ultimately return to the user. 

#### Examples of Middleware Functions

Here are some simple examples of middleware functions.

##### 1. AWS Event `queryStringParameters` normalizer

One annoying thing about AWS's `event` object is that if the user's HTTP request has no query parameters the `event.queryStringParameters` object will be `null` instead of `{}`. This means that everywhere in our code we have to check if `event.queryStringParameters` is first `null` before we check if our. 

Instead of putting these checks everywhere, let's write a middleware function that will do it once and set 
```js
// 1. define our middleware function
const queryStringParametersNormalizer = async (ctx, next) => {
  // Because we want all "downstream" logic to not 
  // have to check "event.queryStringParameters == null"
  // we put this logic BEFORE "await next()"
  let event = ctx.event
  if (!event.queryStringParameters) {
    event.queryStringParameters = { }
  }
  await next()
  return
}
// 2. add it to the request middleware stack
// when the "request" lifecycle handler is invoked
// by Funcmatic
func.request(queryStringParametersNormalizer)
```

##### 2. CORS Headers 

*It's always CORS!* To be honest, I still do not understand how to properly configure API Gateway's built in CORS support. Rather than leave it up to AWS, let's not leave things to chance and just set the CORS header `Access-Control-Allow-Origin` to `*` ourselves. This will allow our API can be called from any website domain.

```js
// We can define and add our middleware function 
// at the same time.
func.request(async (ctx, next) => {
  await next()
  // Note that this logic happens "upstream" when control
  // is flowing back up the middleware stack to the user. 
  // We assume that some downstream logic has put the 
  // response to be returned to the user in the  
  // context object i.e. "ctx.response". 
  // This middleware is just adding 
  // and additional header key-value to it.
  let response = ctx.response
  if (!response.headers["Access-Control-Allow-Origin"]) {
    response.headers["Access-Control-Allow-Origin"] = "*"
  }
  return
})
```

##### 3. Elapsed Time Logger

Given the distributed nature of serverless, logging and monitoring are common ways to apply middleware. 

If the middleware function below is the topmost function of the *request middleware stack* it will log the elapsed execution time of the entire request middleware stack.

```js
  // Ideally, this middleware function will the first 
  // function added to the 'request' middleware stack 
  // so that we account for all of the nested 
  // middleware functions in the stack.
func.request(async (ctx, next) => {
  // We have to capture the initial request time
  // in the "downstream" logic otherwise we won't 
  // account for the execution that happens downstream.
  let t = Date.now()
  let id = ctx.context.awsRequestId
  await next()
  // This logic happens "upstream" because elapsed 
  // time needs to account for all downstream AND upstream logic
  // 
  // We use Funcmatic's built in JSON-formatted logger
  // "ctx.logger" to log the 
  // * id: AWS Lambda request id
  // * t: The time of the request in ms since epoch
  // * elapsed: How long the request took in ms
  ctx.logger.info({ id, t, elapsed: (Date.now() - t) })
  return
})
```

### Middleware Plugins

Middleware Plugins are Javascript classes that define one or more lifecycle methods. 

```js
class MyMiddlewarePlugin {
  // Lifecycle middleware methods must be use 
  // the exact names below to be recognized
  // by Funcmatic
  env(ctx, next) { 
    /* Downstream logic ... */ 
    await next()
    /* Upstream logic ... */
    return
  }
  start(ctx, next) { }
  request(ctx, next) { }
  error(ctx, next) { }
  teardown(ctx, next) { }
}

// Adds the individual lifecycle methods 
// defined above to the appropriate 
// lifecycle middleware stacks
func.use(new MyMiddlewarePlugin())
```
**It is recommended that you create and use middleware as *plugins* rather than as individual *functions*.**

Why use plugins rather than individual functions?

1. Plugins are ***easier to understand*** since the all related functionality is in one place and functions are named after the middleware stack that they will be added to.
2. Plugins are ***easier to use*** since a single call to `func.use(...)` will add multiple methods to their correct lifecycle middleware stack.


#### Example: Using the response-plugin  

The [response-plugin]() creates a `response` object and sets it in the `ctx.response`. This response object makes it format HTTP responses according to AWS's Lambda Proxy Integration format. 

##### 1. Install the plugin 

```
$> npm install -save '@funcmaticjs/response-plugin'
```

##### 2. Add the plugin to your function

There are three steps you must take in your code:

1. Import the `ResponsePlugin` class via `require`
2. Create an instance of the `ResponsePlugin`
3. Call `func.use` with the instance

Here is the code below: 

```js
let func = require('@funcmaticjs/func')
let ResponsePlugin = require('@funcmaticjs/response-plugin')
func.use(new ResponsePlugin())
/* ... */
```

#### Available Middleware Plugins

There are already some handy middleware plugins that have been created and ready to use in your functions: 

##### Environment Variables and Config
* [ProcessEnvPlugin](https://github.com/funcmaticjs/processenv-plugin): Automatically bring all `process.env` variables to `ctx.env`
* [StageVarsPlugin](https://github.com/funcmaticjs/stagevars-plugin): Set API Gateway Stage Variables in `ctx.env`
* [ParameterStorePlugin](https://github.com/funcmaticjs/parameterstore-plugin): Fetch environment variables from AWS Parameter Store and set them in `ctx.env`

##### AWS Event and Context
* [EventPlugin](https://github.com/funcmaticjs/event-plugin): Makes working with AWS API Gateway's Lambda Proxy Integration event a little more friendly.
* [BodyParserPlugin](https://github.com/funcmaticjs/bodyparser-plugin): Parse common types of event.body content (e.g. application/json, application/x-www-form-urlencoded, multipart/form-data).

##### Authentication and Authorization
* [Auth0Plugin](https://github.com/funcmaticjs/auth0-plugin): Verifies an Auth0 JWT token in the 'Authorization' header and puts the decoded token in 'ctx.state.auth'

##### Datastores
* [MemoryCachePlugin](https://github.com/funcmaticjs/memory-cache-plugin): Implements a simple in-memory based cache
* [DynamoDBCachePlugin](https://github.com/funcmaticjs/dynamodb-cache-plugin): Creates a simple async cache interface (get, set, del) around DynamoDB.
* [MongoDBPlugin](https://github.com/funcmaticjs/mongodb-plugin): Creates and manages a MongoDB connection

##### Response 
* [ResponsePlugin](https://github.com/funcmaticjs/response-plugin): Express-like HTTP response methods (e.g. res.json(), res.sendFile()) to be used in AWS Lambda Node functions connected to API Gateway using AWS Lambda Proxy Integration.

##### Logging and Monitoring
* [CorrelationPlugin](https://github.com/funcmaticjs/correlation-plugin): Sets 'x-correlation-id' in 'ctx.logger' so that log messages can be correlated across different functions and services.
* [LogLevelPlugin](https://github.com/funcmaticjs/loglevel-plugin): Uses the 'X-Log-Level' or 'X-Correlation-Log-Level' headers to dynamically set the log level of ctx.logger.
* [AccessLogPlugin](https://github.com/funcmaticjs/accesslog-plugin): Log a JSON line at the end of a request using NGINX access_log format.

## <a name="context"></a>The Context Object (`ctx`)

The context object (`ctx`) is the shared state between AWS Lambda, the Funcmatic framework, middleware, and your function's unique code. It is the interface in which information is passed between each of these layers. 

### `ctx.event` 

Initialized to be the event created by AWS Lambda when your function is invoked. Funcmatic is primarily designed to be build HTTP APIs, this will most likely be an event in API Gateway Lambda Proxy Integration event format. 

Here is an [example](https://github.com/funcmaticjs/funcmatic/blob/master/test/data/api-gateway-aws-proxy.json) of what the `ctx.event` object could look like.

*Note that some middleware, such as [EventPlugin](https://github.com/funcmaticjs/event-plugin), may alter the original AWS event.*

Some notable properties of the `ctx.event` object are:

- ``:

### `ctx.context`

Initialized to be the [AWS Lambda Context object](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html) created by AWS Lambda when your function is invoked. 

Unlike the AWS event above, the format of this context object remains consistent and independent of what service invoked your function (e.g. API Gateway, S3).

Some notable properties of the `ctx.context` object are:

- `awsRequestId`
  - Unique string for every invocation of your function (e.g. )
- `functionName`
  - The name you gave your function when creating it in AWS Lambda 
- `functionVersion`
  - The version of your function that is being invoked (e.g. )
- `invokedFunctionArn` 
  - The full ARN. If your function was invoked using an [alias]() this is the only way to figure that out.
- `callbackWaitsForEmptyEventLoop`
  - Funcmatic sets this value to `false`. 
    - This means that when the `request` handler completes, AWS Lambda will immediately return the value in `ctx.response` even if the Node.js event loop is not empty.
  - If you want to change the default behavior your can set this value to `true`. Which means that AWS Lambda will wait for the Node.js event loop to be empty before returning the response.
    - `ctx.context.callbackWaitsForEmptyEventLoop = true`

### `ctx.response` 

This is what needs to be set by your function before it completes execution. This is the value that will be returned to AWS Lambda and ultimately back to the requesting client. 

Assumming that you are using API Gateway and it's [Lambda Proxy Integration](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html) then the response must be an object with the following structure:

```js
{
  "statusCode": httpStatusCode, /* e.g. 200 */
  "headers": { 
    "headerName": "headerValue", 
    ... 
  },
  "multiValueHeaders": { 
    "headerName": ["headerValue", "headerValue2" ]
  },
  "body": "...",
  "isBase64Encoded": true|false
}
```

If your function is returning a JSON object:

```js
{
  "statusCode": 200, // Internal Server Error
  "headers": {
    "Content-Type": "application/json; charset=utf-8"
  },
  "body": "{\"hello\":\"world\"}",
  "isBase64Encoded": false
}
```

If your function is returning binary data (e.g. an jpeg image):

```js
{
  "statusCode": 200, // Internal Server Error
  "headers": {
    "Content-Type": "image/jpeg"
  },
  "body": "/9j/2wBDAAMCAgICAgMCAgIDAw...", // Base64 encoded image data 
  "isBase64Encoded": true
}
```

If you are returning an HTTP error: 

```js
{
  "statusCode": 500, // Internal Server Error
  "headers": {
    "Content-Type": "application/json; charset=utf-8"
  },
  "body": "{\"errorMessage\":\"My error message\"}",
  "isBase64Encoded": false
}
```

The [ResponsePlugin](https://github.com/funcmaticjs/response-plugin) is intended to help abstract the specifics of API Lambda Proxy format. We can produce the equivalent response in the examples above by:

```js
async (ctx) => {
  ctx.response.json({ hello: 'world'})
  ctx.response.blob("image.jpeg")
  ctx.response.httperror(500, 'My error message')
}
```

### `ctx.env`

This is intended to contain all the configuration values that your function needs. When your function is first cold started, Funcmatic will initialize `ctx.env` to an empty object `{}`. But unlike `event`, `context`, and `state`, the values you choose to store in `ctx.env` will be preserved across invocations.

The single responsibility of your function's `env` handler is to fetch configuration values and populate them in `ctx.env`. The benefits of this is that it isolates the complexity of where your config is stored (e.g. `process.env`, AWS Parameter Store, API Gateway Stage Variables), to a single handler (`env`) and beyond that point the rest of your function's logic only needs to interact with the `ctx.env` object.

### `ctx.state`

This is initialized to an empty object `{}` upon every invocation of your function whether it is a cold or warm start. It borrows its purpose from Express as the recommended place to pass data between middleware and your function's logic. The Funcmatic framework does not do anything directly with this object except initialize it to `{}`.

For example, if you use the [MongoDBPlugin](https://github.com/funcmaticjs/mongodb-plugin), it will create a connection to a MongoDB server and sets the connection in `ctx.state.mongodb`.

```js
ctx.state.mongodb = await connectToMongoDB()
```

Then your own function's code can access the connection:

```js
async (ctx) => {
  let userid = ctx.event.queryStringParameters['userid']
  let db = ctx.state.mongodb
  let user = await db.findOne({ userid })
  /* ... */
}
```

### `ctx.coldstart`

This is a literal boolean value (`true` or `false`).

- `true`: This current invocation of your function is a cold start meaning that the `event` and `start` handlers will be invoked as part of this invocation.
- `false`: This current invocation is NOT a cold start (i.e. a warm start) and therefore the `event` and `start` handlers will not be invoked as part of this invocation.

### `ctx.logger` 

Funcmatic provides a default JSON logger `ctx.logger`. See *Logging using `ctx.logger`* section for more detailed info.

### `ctx.func`

A reference of this currently executing Funcmatic function. Most middleware and your function will not need to reference this.

## Logging using the Default Logger

Funcmatic has a very basic structured JSON logger (`ConsoleLogger`) and sets `ctx.logger` to it by default. 

*Why use structured JSON logging in your function? Check out Yan Cui's post, [You need to use structured logging with AWS Lambda](https://hackernoon.com/you-need-to-use-structured-logging-with-aws-lambda-f3af9586d6a8).*

### Logging Messages

Funcmatic's default logger supports all the standard [Log4J Log Levels](https://en.wikipedia.org/wiki/Log4j#Log4j_log_levels): `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `off`.


### Log Level

Supports 

### Setting Metadata

You can add metadata to the logger which will 

### Pretty Logs

When in development it can be difficult to interpret logs JSON format. Turn on pretty logging by ...

## <a href="testing"></a>Unit Testing


##### Unit Testing Plugins

## <a href="alternatives"></a>Alternatives 

If Funcmatic doesn't quite suit your project (or your tastes) here are some other projects that might be useful:

- [serverless-http](https://github.com/dougmoscrop/serverless-http): Use your existing middleware framework (e.g. Express, Koa) in AWS Lambda.
- [serverless-compose](https://github.com/DavidJFelix/serverless-compose): A lightweight middleware framework for AWS lambda.
- [Middy](https://github.com/middyjs/middy): The stylish Node.js middleware engine for AWS Lambda.
- [Lambcycle](https://github.com/juliantellez/lambcycle): Lambcycle is a declarative lambda middleware. Its main purpose is to let you focus on the specifics of your application by providing a configuration cycle.
- [Lambda API](https://github.com/jeremydaly/lambda-api): Lightweight web framework for your serverless applications.

## Contributing

- [Contributor Covenant Code of Conduct](https://github.com/funcmaticjs/funcmatic/blob/master/CODE_OF_CONDUCT.md)
- [Contributing Guidelines](https://github.com/funcmaticjs/funcmatic/blob/master/CONTRIBUTING.md)
- [Raising Issues](https://github.com/funcmaticjs/funcmatic/issues)
- [Submit Pull Requests](https://github.com/funcmaticjs/funcmatic/pulls)
- [Current Contributors](https://github.com/funcmaticjs/funcmatic/graphs/contributors)

## License

Funcmatic is licensed under the the [MIT License](https://github.com/funcmaticjs/funcmatic/blob/master/LICENSE). Copyright &copy; 2019 Funcmatic Inc.


All files located in the node_modules and external directories are externally maintained libraries used by this software which have their own licenses; we recommend you read them, as their terms may differ from the terms in the MIT License.
