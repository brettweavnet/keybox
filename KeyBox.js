var aws = require('aws-sdk');
var openpgp = require('openpgp');
var triplesec = require('triplesec')

var s3 = new aws.S3({ signatureVersion: "v4", region: 'us-west-2' });

function decryptObject(data, password, callback) {
	console.log("Decrypting object.");
	var ciphertext = data.Body.toString();
	triplesec.decrypt ({
		data:          new triplesec.Buffer(ciphertext, "hex"),
		key:           new triplesec.Buffer(password),
		progress_hook: function (obj) { /* ... */ }
	}, function (err, buff) {
		if (err) {
			console.log(err);
			return callback(err)
		} else {
			console.log("Object decrypted.")
			return callback(null, buff.toString());
		}
	});
}

function downloadEncryptedObject(bucketName, S3Key, password, callback) {
	params = { Bucket: bucketName, Key: S3Key }

	console.log("Downloading encrypted object: ", params);

	s3.getObject(params, function(err, data) {
		if (err) {
			console.log(err);
			return callback(err);
		} else {
			decryptObject(data, password, callback);
		}
	});
}

function process(privateKeyData, decryptedPassword, message, callback) {
	var privateKey = openpgp.key.readArmored(privateKeyData).keys[0];
	privateKey.decrypt(decryptedPassword);
	pgpMessage = openpgp.message.readArmored(message);

	openpgp.decryptMessage(privateKey, pgpMessage).then(function(plaintext) {
		return callback(null, plaintext);
	}).catch(callback)
};

exports.handler = function(event, context) {
	var bucketName = event.bucketName;
	var message = event.message;
	var password = event.password;
	var objectKey = "KeyBox/" + event.keyName + ".key";
	var objectPassword = "KeyBox/" + event.keyName + ".password";

	console.log("Bucket: ", bucketName);
	console.log("objectKey: ", objectKey);
	console.log("objectPassword: ", objectPassword);

	var cb = function(err, plaintext) {
		if (err) {
			console.log(err);
			context.fail(err);
		} else {
			context.succeed(plaintext);
		}
	}

	downloadEncryptedObject(bucketName, objectKey, password, function(err, decryptedPrivateKey) {
		console.log("Downloading key.");
		if (err) {
		        console.log(err);
			context.fail(err);
		} else {
			downloadEncryptedObject(bucketName, objectPassword, password, function(err, decryptedPassword) {
				console.log("Downloading password.");
				if (err) {
					console.log(err);
					context.fail(err);
				} else {
					console.log("Decrypting message.");
					process(decryptedPrivateKey, decryptedPassword, message, cb);
				}
			});
		}
	});
}
