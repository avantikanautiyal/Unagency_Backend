import multer from "multer";
import multerS3 from "multer-s3";
import AwsS3 from "../config/aws.config";
import path from "path";
import { Request } from "express";

const storageS3 = multerS3({
  s3: AwsS3,
  acl: "public-read",
  bucket: "prakriadirect",
  contentType: multerS3.AUTO_CONTENT_TYPE,
  metadata: function (req: Request, file: Express.Multer.File, cb: Function) {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req: Request, file: Express.Multer.File, cb: Function) => {
    let path;
    if (req.body.customPath) {
      path = req.body.customPath + "/" + Date.now() + "-" + file.originalname;
    } else {
      path = `mixed/` + Date.now() + "-" + file.originalname;
    }
    cb(null, path);
  },
});

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  // Allow all file types to be uploaded to S3
  callback(null, true);
};

const fileUpload = multer({
  storage: storageS3,
  fileFilter: fileFilter,
});

export { fileUpload };
