# funcmatic

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

It helps when unit testing our function to clean up any resources that our function might be hanging on to after invocation. For example, if we are caching a database connection, our unit test could close the connection.

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

## Context

## Event

## Response

## Logging

## Testing

## Documentation

## Running tests
## Authors
## Community

# License
[MIT](https://github.com/koajs/koa/blob/master/LICENSE)


to make web applications and APIs more enjoyable to write. 