import {P2pError} from './p2pSubscription.js';
export function ratingSummary(data,leaderId){
 const votes=(data.leaderRatings||[]).filter(r=>r.leaderId===leaderId);
 return {count:votes.length,average:votes.length?Math.round(votes.reduce((n,r)=>n+r.stars,0)/votes.length*10)/10:null};
}
export function canRateLeader(data,userId,leaderId){
 if(userId===leaderId)return false;
 return (data.p2pManualRequests||[]).some(r=>r.userId===userId&&(data.groups||[]).some(g=>g.id===r.groupId&&g.ownerId===leaderId)&&(data.p2pManualConfirmations||[]).some(c=>c.requestId===r.id&&c.confirmedBy===leaderId));
}
export class LeaderRatings{
 constructor(subscriptions){this.s=subscriptions;this.repo=subscriptions.repo;}
 view(userId,leaderId){return {...ratingSummary(this.repo.data,leaderId),eligible:canRateLeader(this.repo.data,userId,leaderId),mine:(this.repo.data.leaderRatings||[]).find(r=>r.userId===userId&&r.leaderId===leaderId)?.stars||null};}
 async save(userId,leaderId,stars){return this.s.exclusive(async()=>{
  const d=this.repo.data;if(!canRateLeader(d,userId,leaderId))throw new P2pError('RATING_PARTICIPATION_REQUIRED',403);
  if(stars!==null&&(!Number.isInteger(stars)||stars<1||stars>5))throw new P2pError('RATING_INVALID',400);
  const old=d.leaderRatings;d.leaderRatings=(old||[]).filter(r=>!(r.userId===userId&&r.leaderId===leaderId));
  if(stars!==null)d.leaderRatings.push({userId,leaderId,stars,updatedAt:new Date().toISOString()});
  try{await this.repo.save();}catch(e){d.leaderRatings=old;throw e;}
  return this.view(userId,leaderId);
 });}
}
