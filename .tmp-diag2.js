const mongoose=require("mongoose");require("dotenv").config();
const {BSON}=require("mongodb");
const kb=(v)=>{try{return (BSON.calculateObjectSize({v})/1024)}catch{return 0}};
function top(o,depth,prefix,out){ for(const [k,v] of Object.entries(o||{})){ const s=kb(v); if(s>=50){ out.push([prefix+k,s]); if(depth>0&&v&&typeof v==="object"&&!Array.isArray(v)) top(v,depth-1,prefix+k+".",out);} } return out;}
(async()=>{
  await mongoose.connect(process.env.DB_URI,{serverSelectionTimeoutMS:15000});
  const db=mongoose.connection.db; const jobs=db.collection("enterprise_jobs");
  const sizes=await jobs.aggregate([{$project:{jobId:1,status:1,attempt:1,s:{$bsonSize:"$$ROOT"}}},{$sort:{s:-1}}]).toArray();
  console.log("queued docs:",sizes.filter(x=>x.status==="queued").map(x=>x.jobId+"="+(x.s/1024).toFixed(0)+"KB").join("  "));
  console.log("size distribution (KB):",sizes.map(x=>(x.s/1024).toFixed(0)).join(","));
  for(const id of [sizes[0].jobId, sizes.find(x=>x.status==="queued").jobId]){
    const d=await jobs.findOne({jobId:id}); console.log("\n"+id,d.status,"attempt="+d.attempt,"fields>=50KB:");
    for(const [k,s] of top(d,3,"",[]).sort((a,b)=>b[1]-a[1]).slice(0,12)) console.log("   "+k.padEnd(60),s.toFixed(0)+"KB");
    const pl=d.payload||{}; console.log("   payload keys:",Object.keys(pl).join(","),"| rawPrompt chars:",(pl.rawPrompt||"").length);
  }
  const ex=db.collection("enterprise_executions"); const big=await ex.aggregate([{$project:{executionId:1,s:{$bsonSize:"$$ROOT"}}},{$sort:{s:-1}},{$limit:1}]).toArray();
  const e=await ex.findOne({executionId:big[0].executionId}); console.log("\nlargest execution",e.executionId,e.status,(big[0].s/1024).toFixed(0)+"KB");
  for(const [k,s] of top(e,4,"",[]).sort((a,b)=>b[1]-a[1]).slice(0,8)) console.log("   "+k.padEnd(60),s.toFixed(0)+"KB");
  const j76=await jobs.findOne({attempt:{$gt:1}},{projection:{jobId:1,createdAt:1,startedAt:1,completedAt:1,updatedAt:1,attempt:1,maxAttempts:1,"payload.capabilityId":1}}); console.log("\nattempt>1 job:",JSON.stringify(j76));
  await mongoose.disconnect();
})().catch(e=>{console.error("ERR",e.message);process.exit(1)});
