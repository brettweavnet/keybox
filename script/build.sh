#!/bin/bash

dir=$TMPDIR
file=$dir/deploy.zip
action=$1
arg=$2

echo "Getting dependencies"
result=`npm install --production`
if [ $? -ne 0 ]; then
	echo $result
	echo "Error installing modules"
	exit 1
fi

echo "Building zip file."
result=`zip -r $file KeyBox.js config.json node_modules`
if [ $? -ne 0 ]; then
	echo $result
	echo "Error building zip."
	exit 1
fi

echo "Build located @ $file"

if [ "$action" == "upload" ]; then
	echo "uploading function to $arg"
	result=`aws s3 cp $file s3://$arg/KeyBox/KeyBox.zip`
	if [ $? -ne 0 ]; then
		echo $result
		echo "Error uploading build $arg."
		exit 1
	fi
	echo "Upload successful"
fi

if [ "$action" == "deploy" ]; then
	echo "Updating function $arg"
	result=`aws lambda update-function-code --function-name $arg --zip-file fileb://$file`
	if [ $? -ne 0 ]; then
		echo $result
		echo "Error upading function $arg."
		exit 1
	fi
	echo "Deployed succesfully."
fi
