import mongoose, { Schema } from "mongoose";

export interface IOrganization {
  _id: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  companyName: string;
  companyType: string;
  companyHeadquaters: string;
  companyAddress: string;
  GST: string;
  industry: string;
  website: string;
  contactPerson: string;
  contactEmail: string;
  contactMobile: string;
  status: string;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    companyName: { type: String, required: true },
    companyType: { type: String, required: true },
    companyHeadquaters: { type: String, default: "" },
    companyAddress: { type: String, default: "" },
    GST: { type: String, default: "" },
    industry: { type: String, required: true },
    website: { type: String, default: "" },
    contactPerson: { type: String, default: "" },
    contactMobile: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    status: { type: String, default: "active" },
  },
  { collection: "organizations", timestamps: true }
);

const Organizations = mongoose.model<IOrganization>(
  "Organizations",
  OrganizationSchema
);

export default Organizations;
