import AWS from "aws-sdk";
import { S3Client } from "@aws-sdk/client-s3";

AWS.config.update({
  region: "ap-south-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
});

const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;
const region = "ap-south-1";

const AwsS3 = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
export default AwsS3;
