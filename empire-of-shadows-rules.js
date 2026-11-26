'use strict';

// Executable, independently testable rules shared by the CASPIAN flagship scenario.
function investigatorResult(role,{isMafia=false,godfatherOverride=true}={}){
 if(godfatherOverride&&['امپراتور','پدرخوانده'].includes(role))return 'شهروند';
 return isMafia?'مافیا':'شهروند';
}
function independentResult(role,{isMafia=false,mode='nonmafia'}={}){
 if(mode==='nonmafia')return isMafia?'مافیا':'غیرمافیا';
 return role;
}
function resolveMafiaVote(votes={},godfatherId,settings={}){
 const {godfatherOverride=true,mafiaTieBreak='godfather'}=settings;
 const counts={};
 for(const targetId of Object.values(votes))if(targetId)counts[targetId]=(counts[targetId]||0)+1;
 const max=Math.max(0,...Object.values(counts));
 const leaders=Object.keys(counts).filter(id=>counts[id]===max&&max>0);
 const godfatherChoice=votes[godfatherId];
 // The Emperor/Godfather's valid submitted choice has final authority.
 if(godfatherOverride&&godfatherChoice){
  return {target:godfatherChoice,tied:leaders.length>1,overridden:leaders.length>0&&!leaders.includes(godfatherChoice),decidedBy:'godfather',counts};
 }
 if(leaders.length===1)return {target:leaders[0],tied:false,counts};
 if(leaders.length>1&&mafiaTieBreak==='godfather'&&leaders.includes(godfatherChoice)){
  return {target:godfatherChoice,tied:true,decidedBy:'godfather-tiebreak',counts};
 }
 return {target:null,tied:leaders.length>1,counts};
}
function serialKillerCanKill(nightNumber){
 return Number.isInteger(nightNumber)&&nightNumber>0&&nightNumber%2===0;
}
function serialKillerWin(alivePlayers,hasSerialKiller,condition='alive'){
 return condition==='alive'&&hasSerialKiller&&alivePlayers.length===1;
}
function mafiaWin({mafia=0,town=0,independent=0},condition='parity'){
 if(condition==='parity')return mafia>0&&mafia>=town+independent;
 if(condition==='elimination')return mafia>0&&town===0;
 return false;
}
module.exports={investigatorResult,independentResult,resolveMafiaVote,serialKillerCanKill,serialKillerWin,mafiaWin};
