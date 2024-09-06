# TypingMind Cloud Backup Extension

## Features
- Extension to enable automatic backup & restore of app data to S3.
- Automatically restores the latest backup version from S3 to your TypingMind instance when you first open the app (provided a backup exists).
- Enables auto backing up of your TypingMind data to S3 throughout the session.

## Warning!
Ensure you take a local backup using Menu > Backup & Sync > Export before using this plugin to prevent any data loss.
  
## Using this extension
1. Once the extension is installed, the cloud button in the bottom of the left sidebar will use the new cloud backup logic.
2. Provide the AWS details in the form. [These are stored locally in your browser]
3. The save button checks if there is a backup already in S3, if yes it restores it and updates the local typingmind instance.
4. Manually refresh the page to reflect the new data. CTRL + F5 will help as well.
4. If there is no backup in S3, it is expected that you do an adhoc "Export to S3" to kickstart the process.
3. You can do adhoc cloud backups and restore using the respective buttons in the form.
4. When the local data is changed, it triggers a backup to S3. However, calls are capped at 1 every 15 seconds.

## AWS Config
1. Create a user in Amazon IAM
2. Create Access Key for the user
3. Add Permission Policies to the user -> "AmazonS3FullAccess"
3. Create a bucket.
4. Open Bucket > Permissions > Bucket Policy
``
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::<AWS Account ID>:user/<IAM username>"
            },
            "Action": [
                "s3:PutObject",
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::<AWS bucket name>/*"
        }
    ]
}
``
Update AWS Account ID, IAM username and AWS bucket name

5. Open Bucket > Permissions > CORS
``
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "HEAD",
            "GET",
            "PUT",
            "POST"
        ],
        "AllowedOrigins": [
            "https://*.hostname.com"
        ],
        "ExposeHeaders": [
            "Access-Control-Allow-Origin"
        ],
        "MaxAgeSeconds": 3000
    }
]
``
Update "https://*.hostname.com"

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
