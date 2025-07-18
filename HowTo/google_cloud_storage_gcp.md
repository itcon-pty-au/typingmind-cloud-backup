 # Configuring TypingMind Cloud Sync with Google Cloud Storage (S3-Compatible)

This guide provides step-by-step instructions to configure the TypingMind Cloud Sync extension to use Google Cloud Storage (GCS) as an S3-compatible storage backend. This involves creating a service account, generating HMAC keys for S3 compatibility, and setting up the necessary permissions.

## Step 1: Create a Service Account

A service account is a special type of Google account intended to represent a non-human user that needs to authenticate and be authorized to access data in Google APIs.

1.  Navigate to the **IAM & Admin > Service Accounts** page in the [Google Cloud Console](https://console.cloud.google.com/).
2.  Click **+ Create Service Account**.
3.  Enter a **Service account name** (e.g., `typingmind-sync-account`).
4.  Provide an optional **Service account description**.
5.  Click **Create and Continue**.

## Step 2: Grant Permissions to the Service Account

To allow the service account to manage objects in your GCS bucket, you need to grant it the appropriate IAM roles.

1.  In the **Grant this service account access to project** step, click the **Role** field.
2.  Search for and select the **Storage Object Admin** (`roles/storage.objectAdmin`) role. This provides full control over objects in GCS buckets.
3.  Click **Continue**.
4.  Click **Done** to finish creating the service account.

## Step 3: Create HMAC Keys for S3 Compatibility

For S3 compatibility, you need to generate HMAC (Hash-based Message Authentication Code) keys for your service account. These keys are equivalent to AWS Access Key ID and Secret Access Key.

1.  Go to the **Cloud Storage > Settings** page in the [Google Cloud Console](https://console.cloud.google.com/).
2.  Select the **Interoperability** tab.
3.  If you haven't set a default project for interoperability, you may be prompted to do so.
4.  Under **Access keys for service accounts**, click **+ Create a key for a service account**.
5.  Select the service account you created in Step 1 (e.g., `typingmind-sync-account`).
6.  Click **Create Key**.
7.  A window will appear displaying the **Access ID** (your S3 Access Key) and **Secret** (your S3 Secret Key). **This is the only time you can view the secret.** Copy both of these values and store them securely. You will need them to configure the TypingMind extension.

## Step 4: Configure the TypingMind Extension

Now you can use the generated credentials in the TypingMind Cloud Sync extension.

1.  Open the TypingMind **Sync** settings.
2.  For the provider, select **S3**.
3.  **Bucket Name**: The name of your GCS bucket.
4.  **Region**: The region of your GCS bucket (e.g., `us-central1`) or `auto`.
5.  **Access Key**: The **Access ID** you generated in Step 3.
6.  **Secret Key**: The **Secret** you generated in Step 3.
7.  **S3 Endpoint**: `https://storage.googleapis.com`
8.  Provide your **Encryption Key**.
9.  Save the settings.

## Step 5: Configure CORS on Your GCS Bucket

To allow the TypingMind extension to communicate with your Google Cloud Storage bucket from the browser, you must configure Cross-Origin Resource Sharing (CORS).

1.  This repository contains a pre-configured CORS file located at [`CORS/cors-config-gcp.json`](../CORS/cors-config-gcp.json). If you are self-hosting TypingMind, you will need to edit this file and replace `https://www.typingmind.com` with the URL of your instance.

2.  Use the `gcloud` command-line tool to apply the CORS configuration to your bucket. Run the following command from the root directory of this repository:
    ```bash
    gcloud storage buckets update gs://[YOUR_BUCKET_NAME] --cors-file=cors/cors-config-gcp.json
    ```
    *Replace `[YOUR_BUCKET_NAME]` with the name of your Google Cloud Storage bucket.*

Your TypingMind Cloud Sync extension is now configured to use Google Cloud Storage.