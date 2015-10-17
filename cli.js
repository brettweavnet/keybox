#!/usr/bin/env node

var aws = require('aws-sdk');
var cli = require('cli');
var fs = require('fs')
var openpgp = require('openpgp');
var read = require('read');
var readline = require('readline');
var triplesec = require('triplesec')

var KeyBox = require('./KeyBox');

var lambda = new aws.Lambda({region: 'us-west-2'});
var s3 = new aws.S3({signatureVersion: "v4", region: 'us-west-2'});

function isFile(path) {
        try {
                stats = fs.lstatSync(path);
                if (stats.isDirectory()) {
                        return false;
                }
        } catch (e) {
                return false;
        }

        return true
}

function uploadS3(password, s3Key, data, bucketName) {
	console.log("Encrypting data before uploading to", s3Key);
	var request = {
		data: new triplesec.Buffer(data),
		key: new triplesec.Buffer(password),
		progress_hook: function (obj) { /* ... */ }
	}

	triplesec.encrypt(request, function(err, buff) {
		console.log("Uploading to", s3Key);
		if (! err) {
			var params = {
				Bucket: bucketName,
				Key: s3Key,
				Body: buff.toString('hex'),
				ServerSideEncryption: "aws:kms"
			}

			s3.putObject(params, function(err, data) {
				if (err) {
					return console.log(err);
				}
				console.log("Uploading complete", s3Key);
			});
		}
	});
}

function uploadEncyrptedKeyPassword(options, privateKey, privateKeyData, privateKeyPassword) {
	if (privateKey.decrypt(privateKeyPassword) == false) {
		return console.log("Unable to decrypt key with password");
	}

	read({ prompt: 'Encryption Key: ', silent: true }, function(er, password) {
		objectKey = "KeyBox/" + options.keyName + ".key";
		objectPassword = "KeyBox/" + options.keyName + ".password";

		uploadS3(password, objectKey, privateKeyData, options.bucketName);
		uploadS3(password, objectPassword, privateKeyPassword, options.bucketName);
	});
}

function upload(options) {
	fs.readFile(options.keyPath, 'utf8', function (err, privateKeyData) {
		if (err) {
                        return console.log(err);
                }

		var keys = openpgp.key.readArmored(privateKeyData).keys;

		if (keys.length == 0) {
			return console.log("unable to read key");
		}

		var privateKey = keys[0];

		read({ prompt: 'GPG Password: ', silent: true }, function(er, password) {
			uploadEncyrptedKeyPassword(options, privateKey, privateKeyData, password);
		});
	});
}

function localDecrypt(options) {
	context = {
		succeed: function(data) {
				 process.stdout.write(data);
			 },
		fail: function(data) {
				 process.stdout.write("Error: ", data);
			 }
	}

	fs.readFile(options.messagePath, 'utf8', function (err, data) {
		options["message"] = data;
		read({ prompt: 'Encryption Key: ', silent: true }, function(er, password) {
			options["password"] = password;
			KeyBox.handler(options, context);
		});

	});
}

function printLambdaDecryptOutput(data) {
	if (data.FunctionError) {
		console.log("Unable to decrypt message.");
		console.log("Error: ", data.Payload);
	} else {
		process.stdout.write(data.Payload);
	}
}

function lambdaDecrypt(options) {
	fs.readFile(options.messagePath, 'utf8', function (err, data) {
		options["message"] = data;
		read({ prompt: 'Encryption Key: ', silent: true }, function(er, password) {
			options["password"] = password;

			var params = {
				FunctionName: options.functionName,
				InvocationType: 'RequestResponse',
				LogType: 'None',
				Payload: JSON.stringify(options)
			};

			lambda.invoke(params, function(err, data) {
				if (err) console.log(err, err.stack);
				else     printLambdaDecryptOutput(data);
			});
		});
	});
}

var command = process.argv[2];

if (command == "upload") {
	options = cli.parse({
		bucketName: ['b', 'bucket name', 'string'],
		keyPath:    ['k', 'path to gpg key', 'path'],
		keyName:    ['n', 'key name', 'string']
	});

	if (! isFile(options.keyPath) ) {
		console.log("key " + options.keyPath + " does not exist");
		process.exit(1);
	}

	upload(options);

}

if (command == "decrypt") {
	 options = cli.parse({
		 bucketName:   ['b', 'bucket name', 'string'],
		 functionName: ['f', 'name of lambda function', 'string', ''],
		 local:        ['l', 'run locally', 'boolean', false],
		 messagePath:  ['m', 'path to gpg encrypted message', 'path'],
		 keyName:      ['n', 'key name', 'string'],
	 });

	 if (! isFile(options.messagePath) ) {
		 console.log("message " + options.keyPath + " does not exist");
		 process.exit(1);
	 }

	 if (options.local) {
		 localDecrypt(options);
	 } else {
		 lambdaDecrypt(options);
	 }
}
