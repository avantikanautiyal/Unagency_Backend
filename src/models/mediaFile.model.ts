import mongoose, { Schema, Document } from "mongoose";

export interface IMediaFile extends Document {
    url: string;
    uploadedAt: Date;
    fileName: string;
    tag: string;
}

const MediaFileSchema: Schema = new Schema(
    {
        url: {
            type: String,
            required: true,
        },
        fileName: {
            type: String,
        },
        uploadedAt: {
            type: Date,
            default: Date.now,
        },
        tag: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true,
    }
);

const MediaFile = mongoose.model<IMediaFile>("MediaFile", MediaFileSchema);

export default MediaFile;
