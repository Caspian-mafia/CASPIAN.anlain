'use strict';
const {Pool}=require('pg');
const fs=require('node:fs');
const path=require('node:path');
let pool=null,ready=false;
const testRooms=new Map();
function isReady(){return ready;}
async function init(){
 if(process.env.CASPIAN_TEST_MEMORY==='1'){ready=true;return;}
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; refusing to start with volatile in-memory storage');
 pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false},max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
 await pool.query(`CREATE TABLE IF NOT EXISTS caspian_rooms (
  code VARCHAR(12) PRIMARY KEY,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query('SELECT 1');
 const platformSchema=fs.readFileSync(path.join(__dirname,'database','platform-schema.sql'),'utf8');
 await pool.query(platformSchema);
 const adminSchema=fs.readFileSync(path.join(__dirname,'database','admin-schema.sql'),'utf8');
 await pool.query(adminSchema);
 const socialSchema=fs.readFileSync(path.join(__dirname,'database','social-guilds-birthdays.sql'),'utf8');
 await pool.query(socialSchema);
 ready=true;
}
async function query(text,params=[]){
 if(!ready||!pool)throw new Error('database is not ready');
 return pool.query(text,params);
}
async function withTransaction(work){
 if(!ready||!pool)throw new Error('database is not ready');
 const client=await pool.connect();
 try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
}
async function save(room){
 if(process.env.CASPIAN_TEST_MEMORY==='1'){testRooms.set(room.code,JSON.parse(JSON.stringify(room)));return;}
 await query(`INSERT INTO caspian_rooms(code,state) VALUES($1,$2::jsonb)
 ON CONFLICT(code) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()`,[room.code,JSON.stringify(room)]);
}
async function load(){
 if(process.env.CASPIAN_TEST_MEMORY==='1')return [...testRooms.values()];
 const {rows}=await query('SELECT state FROM caspian_rooms ORDER BY created_at');
 return rows.map(row=>row.state);
}
async function remove(code){if(process.env.CASPIAN_TEST_MEMORY==='1'){testRooms.delete(code);return;}if(ready)await query('DELETE FROM caspian_rooms WHERE code=$1',[code]);}
async function close(){ready=false;if(pool)await pool.end();pool=null;}
module.exports={init,save,load,remove,close,isReady,query,withTransaction};
