# tunnel-vision

An ngrok alternative backed by AWS Lambda, SQS, and serverless.

## how to use

To use tunnel-vision you need to have an aws account, that has already set up the necessary prerequisite for this client to connect.

- install from npm

```sh
npm i -g tunnel-vision
```

- create your configuration file.
  A minimum configuration would look something like this

```sh
AWS_REGION="ap-southeast-1"

TARGET_HOST="https://example.com"
REQUEST_QUEUE="https://sqs.ap-southeast-1.amazonaws.com/0000000/request-queue"
RESPONSE_QUEUE="https://sqs.ap-southeast-1.amazonaws.com/000000/response-queue"
```

- setup your aws credential in ~/.aws/credentials

```
[tunnelvision]
access_key_id: AKIAXXXXXXXXXXXX
secret_access_key: XXXXXXXXXXXXXXXXXXXXX
```

- run the program

```sh
AWS_PROFILE="tunnelvision" tunnel-vision -c path/to/configuration-file
```

or you can put the configuration file to ~/.tunnelvision and run the program

```sh
AWS_PROFILE="tunnelvision" tunnel-vision
```
