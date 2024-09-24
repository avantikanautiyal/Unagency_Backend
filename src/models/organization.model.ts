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
export class Organization {
  owner?: string;
  companyName: string;
  companyType: string;
  companyHeadquarters: string;
  companyAddress: string;
  GST?: string;
  industry: string;
  website?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactMobile?: string;
  status?: string;
  constructor(data: any) {
    this.owner = data.owner;
    this.companyName = data.companyName || '';
    this.companyType = data.companyType || '';
    this.companyHeadquarters = data.companyHeadquarters || '';
    this.companyAddress = data.companyAddress || '';
    this.GST = data.GST || '';
    this.industry = data.industry || '';
    this.website = data.website || '';
    this.contactPerson = data.contactPerson || '';
    this.contactEmail = data.contactEmail || '';
    this.contactMobile = data.contactMobile || '';
    this.status = data.status || '';

  }
}

export default Organizations;
