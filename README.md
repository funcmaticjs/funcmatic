# funcmatic

https://github.com/koajs/koa

## Introduction

Funcmatic helps you write serverless Javascript functions that respond to web requests. What Express is for building Node.js web servers, Funcmatic is for building Node.js serverless web functions. 
 
### Key Features
 
- Organize business logic into different lifecycle stages.
- Create and reuse middleware across functions.
 
### Lightweight Approach

Funcmatic is super-lightweight:

- The core framework is a single file (< 400 lines).
- **No additional packages** or dependencies. 
- Does not use Node’s net/http library (i.e. request/response).
- Does not depend on any server-only Javascript modules (e.g. ‘os’, ‘fs’).

It is able to be so tiny because:

- Supports a single AWS Lambda runtime only: Node 8.10 (async/await).
- Does not alter, wrap, or abstract the raw AWS event and context objects.
- Does not dictate the response format.
- Does not help with packaging, deployment, provisioning, configuration.
- No aspirations to support “multi-cloud” (e.g. Azure Functions, Google Cloud Functions).

### Compatibility with Other Frameworks

Because Funcmatic only focuses on the organization of your function's business logic itself, it complements packaging and deployment frameworks such as [Serverless Framework](https://github.com/serverless/serverless) and [AWS SAM CLI](https://github.com/awslabs/aws-sam-cli).


## Installation

Since Funcmatic only supports AWS Lambda's [Node.js 8.10 runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html), it requires **node v8.10** or higher. 

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

Checkout some of the well commented [examples](https://github.com/funcmaticjs/examples) to get a feel for what Funcmatic functions look like:

* [Hello World](https://github.com/funcmaticjs/examples/tree/master/helloworld)
* More examples coming soon ...

## Lifecycle Handlers

AWS Lambda invokes [single handler](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html) which needs to execute all of our business logic.

```js
// Standard AWS Lambda Handler
module.exports.lambdaHandler = async function(event, context) {
  // ... your function code  
  return "some success message"
  // or 
  // throw new Error("some error type"); 
}
```

Funcmatic divides execution into four lifecycle stages which developer can attach different business logic which will execute only during that stage.

### 1. env handler

The purpose of the env handler is to fetch all necessary configuration values and set them in the **ctx.env** object. It is the first handler to execute during a **cold start**.

```js
func.env(async (ctx) => {
  let vars = await fetchFromSomewhere()
  ctx.env.DB_CONNECTION_URI = vars.DB 
})
```

Examples:

- Decrypt AWS Lambda environment variables
- Download and parse a config file stored in S3
- Fetch environment variables stored in AWS Parameter Store

### 2. start handler

The purpose of the start handler is to execute logic that is only intended to be run during a cold start. It is executed after **env** during a **cold start**.

```js
func.start(async (ctx) => {
  // 
  ctx.env.db = await connectToSomeDB(ctx.env.DB_CONNECTION_URI)
})
```

Examples:

- 

### 3. request

### 4. error

### teardown


## Middleware

## Context

## Event

## Response

## Logging

## Testing

## Koa Application

## Documentation

## Running tests
## Authors
## Community

# License
[MIT](https://github.com/koajs/koa/blob/master/LICENSE)


to make web applications and APIs more enjoyable to write. 