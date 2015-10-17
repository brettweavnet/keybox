# keybox

keybox encrypts and stores your private key and password in S3. It creates a lambda
function which allows you to pass in encrypted data and the decryption key to 
decrypt a message encrypted with the public key.

## Why do I care?

Having your key encrypted in S3 and accessible by a lambda function allows for 
the following.

* Require MFA by creating a role which must be assumed prior to using the key.
* Auditing each time it is used to decrypt something via Cloud Trail.
* Key leakage due to malware or other compromise of your computer.

## Pre-reqs

* Node JS
* AWS CLI
* gpg

Clone down this repo to you local instance, you will need it to create the Lambda
functions and AWS users.

```
git clone https://github.com/brettweavnet/keybox
```

## Setup

Install the keybox cli

```
npm install keybox
npm link keybox
```

Create a bucket to hold the things.

```
aws s3 mb --region us-west-2 BUCKET_NAME
```

Upload a build of keybox to the bucket.

```
bash script/build.sh upload BUCKET_NAME
```

Create the lambda function and IAM user which will perform the decryption.

```
aws cloudformation create-stack \
	--stack-name KeyBox \
	--template-body file:///path/to/keybox/templates/cloudFormationTemplate.json \
	--capabilities CAPABILITY_IAM \
	--parameters ParameterKey=BucketName,ParameterValue=BUCKET_NAME
```

Export your private key to be uploaded to S3.

```
gpg --export-secret-key -a user@user.com > ~/private.key
```

You now need to upload your private key.  It will ask you for your GPG password and
then a password to encrypt the file.  This password qill be required to decrypt messages.

```
keybox upload -b BUCKET_NAME -n KEY_NAME -k ~/private.key
```

Finally cleanup your exported private key.

```
rm ~/private.key
```

You have now uploaded you key and created a lambda function which can be used
to decrypt data!

## Usage

Get the name of the lambda function created by the Cloud Formation stack

```
aws cloudformation describe-stack-resources --stack-name KeyBox
```

You can decrypt messages by passing the following.

```
keybox decrypt \
	-b BUCKET_NAME \
	-n KEY_NAME \
	-f KeyBox-Decrypt-ABCD \
	-m message_to_decrypt.asc \
```

## MFA

If you want to ensure ever call is MFAed, create a role via the below command which
will require MFA to assume.


```
aws cloudformation create-stack \
	--stack-name KeyBoxRole \
	--template-body file:///path/to/keybox/templates/executeRole.json \
	--capabilities CAPABILITY_IAM
```

This role will only have permissions to execute the keybox lambda function. Use **aws
sts assume-role** prior to executing the keybox function
