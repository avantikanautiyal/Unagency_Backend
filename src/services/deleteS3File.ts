import {
  DeleteObjectCommand,
  DeleteObjectCommandInput,
} from "@aws-sdk/client-s3";
import AwsS3 from "../config/aws.config";

const deleteS3File = async (
  params: DeleteObjectCommandInput
): Promise<void> => {
  try {
    const deleteCommand = new DeleteObjectCommand(params);
    await AwsS3.send(deleteCommand);
    console.log(`File Delete ${params.Key}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error deleting file from S3: ${error.message}`);
    } else {
      console.error(`Unknown error deleting file from S3: ${String(error)}`);
    }
  }
};

export default deleteS3File;
