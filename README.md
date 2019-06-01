
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

Logging and monitoring are often challenges 

```js
func.request(async (ctx, next) => {
  // We have to capture the initial request time
  // in the "downstream" logic otherwise we won't 
  // account for the execution that happens downstream.
  // Ideally, this middleware function will the first 
  // function in the stack so we account for all other nested
  // middle functions.
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

Plugins are defined as Javascript classes that define one or more lifecycle-specific middleware functions. The class should have the following structure below (only including the lifecycle methods for which your plugin needs to engage with).


```js
class MyMiddlewarePlugin {

  env(ctx, next) { }
  start(ctx, next) { }
  request(ctx, next) { }
  error(ctx, next) { }
  teardown(ctx, next) { }
}

func.use(new MyMiddlewarePlugin())
```


While Funcmatic supports creating and adding individual function middleware, ***we recommend that you create and use middleware as plugins rather than individual functions***. The reasons are:

1. It is because it is more self-documenting as async functions which lifecycle
2. Easier for developers to use since instead of importing/adding each method they just do a `func.use` 
3. It puts all releveant logic in one place


#### Using a Published Middleware Plugin 

The [response-plugin]() does blah blah and is accessible via NPM. 

##### 1. First install the plugin 

```
$> npm install '@funcmaticjs/response-plugin'
```

##### 2. Require the plugin's class, create an instance, and call `func.use`

```js
let func = require('@funcmaticjs/func')

You can add plugins to your function's middleware stack by calling `use`:
let ResponsePlugin = require('@funcmaticjs/response-plugin')

// 
func.use(new ResponsePlugin())
```

## Available Middleware Plugins

### Environment Variables and Config
* [ProcessEnvPlugin](https://github.com/funcmaticjs/processenv-plugin): Automatically bring all `process.env` variables to `ctx.env`
* [StageVarsPlugin](https://github.com/funcmaticjs/stagevars-plugin): Set API Gateway Stage Variables in `ctx.env`
* [ParameterStorePlugin](https://github.com/funcmaticjs/parameterstore-plugin): Fetch environment variables from AWS Parameter Store and set them in `ctx.env`

### AWS Event and Context
* [EventPlugin](https://google.com): Makes working with AWS API Gateway's Lambda Proxy Integration event a little more friendly.
* [BodyParserPlugin](https://github.com/funcmaticjs/bodyparser-plugin): Parse common types of event.body content (e.g. application/json, application/x-www-form-urlencoded, multipart/form-data).

### Authentication and Authorization
* [Auth0Plugin](https://google.com): 
* [Auth0CachePlugin](https://google.com):  

### Datastores
* [MemoryCachePlugin](https://github.com/funcmaticjs/memory-cache-plugin): Implements a simple in-memory based cache
* [DynamoDBCachePlugin](https://github.com/funcmaticjs/dynamodb-cache-plugin): Creates a simple async cache interface (get, set, del) around DynamoDB.
* [MongoDBPlugin](https://github.com/funcmaticjs/mongodb-plugin): Creates and manages a MongoDB connection

### Response 
* [ResponsePlugin](https://github.com/funcmaticjs/response-plugin): Express-like HTTP response methods (e.g. res.json(), res.sendFile()) to be used in AWS Lambda Node functions connected to API Gateway using AWS Lambda Proxy Integration.

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


##### Unit Testing Plugins



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

#### Using Middleware Functions

To add a middleware function to a lifecycle's middleware stack, just pass the function to a call to `func.env`, `func.start`, `func.request`, `func.error`, `func.teardown`.

For example, 
