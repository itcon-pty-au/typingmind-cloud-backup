# TypingMind S3 Backup Extension

[If you found this useful, please consider buying me a coffee](https://buymeacoffee.com/itcon):heart:!

## Features
- Extension to enable automatic backup & restore of app data to S3. (Full backup, not incremental)
- The entire typingmind data is stored in S3 as a single JSON file. This file is overwritten each time a backup is written to S3.
- Automatically restores the latest backup version from S3 to your TypingMind instance when you first open the app (provided a backup exists).
- Enables automatic backing up of your TypingMind data to S3 throughout the session as per backup interval configured.
- Last 30 days 'backup of backup' for a stress free experience. Apart from the single backup file, the extension now creates a daily 'no-touch' zipped backup of the main backup file. In case the main backup file gets corrupted, you can restore it using the previous day's backup!

## New features implemented in [Beta Repo](https://github.com/itcon-pty-au/typingmind-cloud-backup-beta)
- The repos are in sync currently. No new features added in Beta
  
## Using this extension
WARNING: Ensure you take a local backup from "SETTINGS > APPDATA & STORAGE > EXPORT" before setting up the extension.
1. Load "https://itcon-pty-au.github.io/typingmind-cloud-backup/s3.js" into Menu > Preferences > Extension in Typingmind.
2. Once the extension is installed, a new Backup button will be added to the menu. Clicking on this will bring up the S3 backup configuration form.
3. Provide the AWS details in the form. [These are stored locally in your browser]
4. The save button checks if there is a backup already in S3, if yes it restores it and updates the local typingmind instance.
5. Manually refresh the page to reflect the new data. CTRL + F5 if it does not.
4. If there is no backup in S3, it is expected that you click on the "Export to S3" button in the configuration form to kickstart the backup process.
3. You can do on demand cloud backups and restore using the respective buttons in the form - "Export to S3" and "Import from S3".
4. Full backup to S3 is performed as per the backup interval configured. 

## AWS Config
1. Create a user in Amazon IAM. In permissions option, select "Add user to group" but don't select any group. In next screen, "Create user".
2. Open the user. Create Access Key for the user. In Step 1, select "Other", you can skip Step 2 and directly create Access Key. Copy the Access key and Secret Key and store it securely. You will need this to configure the extension.
3. Create a bucket with the default settings. Due to security reasons, it is recommended to create a new bucket for Typingmind backup and ensure that no other files are stored in it.
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
                "s3:ListBucket",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject"
            ],
            "Resource": [
                "arn:aws:s3:::<AWS bucket name>",
                "arn:aws:s3:::<AWS bucket name>/*"
            ]
        },
    		{
                "Sid": "PreventSpecificFileDeletion",
                "Effect": "Deny",
                "Principal": {
                    "AWS": "arn:aws:iam::<AWS Account ID>:user/<IAM username>"
                },
                "Action": "s3:DeleteObject",
                "Resource": "arn:aws:s3:::<AWS bucket name>/typingmind-backup.json"
       }
    ]
}
``
Update AWS Account ID, IAM username and AWS bucket name in the policy with your specific values.

6. Open Bucket > Permissions > CORS
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
            "POST",
            "DELETE"
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
If you are using typingmind cloud, use the below
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
            "POST",
            "DELETE"
        ],
        "AllowedOrigins": [
            "https://www.typingmind.com"
        ],
        "ExposeHeaders": [
            "Access-Control-Allow-Origin"
        ],
        "MaxAgeSeconds": 3000
    }
]
``
Update "https://*.hostname.com" with your specific hostname in case you are self hosting Typingmind (e.g. https://chat.yourhostname.com). If you are using Typingmind cloud, hostname should be https://www.typingmind.com. This restricts executing S3 commands from only the specified hostname providing better security.

## About me
I am a passionate developer dedicated to creating useful tools that can benefit the community. My goal is to distribute all of my projects as open source, enabling others to learn, contribute, and innovate together. If you appreciate my work and want to support my efforts, feel free to [buy me a coffee](https://buymeacoffee.com/itcon) :heart:!

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
