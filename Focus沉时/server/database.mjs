import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000');
  const previousVersion = db.prepare('PRAGMA user_version').get().user_version;
  if (previousVersion > 6) { db.close(); throw new Error('数据库版本高于当前程序，禁止降级启动'); }
  if (previousVersion === 1 && path !== ':memory:') {
    db.prepare('VACUUM INTO ?').run(path + '.v1-backup-' + Date.now());
  }
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, estimate INTEGER NOT NULL DEFAULT 1,
      completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      task_title TEXT NOT NULL, duration INTEGER NOT NULL, elapsed INTEGER NOT NULL DEFAULT 0,
      running_since INTEGER, status TEXT NOT NULL CHECK(status IN ('running','paused','completed','cancelled')),
      started_at TEXT NOT NULL, finished_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions ((1)) WHERE status IN ('running','paused');
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), focus_minutes INTEGER NOT NULL, break_minutes INTEGER NOT NULL);
    INSERT OR IGNORE INTO settings VALUES (1,25,5);
    `);
  if (db.prepare('PRAGMA user_version').get().user_version < 2) {
    // SQLite 对有数据的旧表禁止直接添加带非空默认值的 REFERENCES 列。
    // 迁移事务内暂关外键，所有旧记录归入已创建的归档用户，提交前校验完整性。
    db.exec('PRAGMA foreign_keys = OFF');
    try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE users(id INTEGER PRIMARY KEY, openid TEXT UNIQUE, dev_account TEXT UNIQUE, password_hash TEXT, nickname TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO users(id,nickname) VALUES(1,'旧版资料归档');
      ALTER TABLE tasks ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id);
      ALTER TABLE sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id);
      DROP INDEX one_active_session;
      CREATE UNIQUE INDEX one_active_session ON sessions(user_id) WHERE status IN ('running','paused');
      CREATE INDEX tasks_user ON tasks(user_id,id);
      CREATE INDEX sessions_user ON sessions(user_id,status,id);
      CREATE TABLE user_settings(user_id INTEGER PRIMARY KEY REFERENCES users(id),focus_minutes INTEGER NOT NULL DEFAULT 25,break_minutes INTEGER NOT NULL DEFAULT 5);
      INSERT INTO user_settings SELECT 1,focus_minutes,break_minutes FROM settings;
      CREATE TABLE auth_tokens(hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
      CREATE INDEX auth_tokens_user ON auth_tokens(user_id);
      CREATE TABLE rooms(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,invite_code TEXT NOT NULL UNIQUE,capacity INTEGER NOT NULL DEFAULT 12,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE room_members(user_id INTEGER PRIMARY KEY REFERENCES users(id),room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,joined_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);
      CREATE INDEX members_room ON room_members(room_id);
      PRAGMA user_version = 2;`);
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('数据库迁移外键检查失败');
    db.exec('COMMIT; PRAGMA foreign_keys = ON');
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (db.prepare('PRAGMA user_version').get().user_version < 3) {
    if (previousVersion === 2 && path !== ':memory:') db.prepare('VACUUM INTO ?').run(path + '.v2-backup-' + Date.now());
    try {
    db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE user_settings ADD COLUMN daily_goal INTEGER NOT NULL DEFAULT 100;
      CREATE TABLE checkins(user_id INTEGER NOT NULL REFERENCES users(id),day TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,day));
      CREATE TABLE journals(user_id INTEGER NOT NULL REFERENCES users(id),day TEXT NOT NULL,content TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,day));
      PRAGMA user_version=3; COMMIT;`);
    } catch(error) { if(db.isTransaction)db.exec('ROLLBACK');db.close();throw error; }
  }
  if (db.prepare('PRAGMA user_version').get().user_version < 4) {
    if(previousVersion===3&&path!==':memory:')db.prepare('VACUUM INTO ?').run(path+'.v3-backup-'+Date.now());
    try { db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS countdowns(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,target_date TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS countdowns_user ON countdowns(user_id,target_date);
      CREATE TABLE IF NOT EXISTS wishes(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),content TEXT NOT NULL,anonymous INTEGER NOT NULL DEFAULT 0,fulfilled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS wishes_user ON wishes(user_id,created_at);
      CREATE TABLE IF NOT EXISTS wish_posts(user_id INTEGER NOT NULL REFERENCES users(id),posted_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS wish_posts_user ON wish_posts(user_id,posted_at);
      CREATE TABLE IF NOT EXISTS wish_reports(wish_id INTEGER NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id),PRIMARY KEY(wish_id,user_id));
      PRAGMA user_version=4; COMMIT;`);
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');db.close();throw error;}
  }
  if (db.prepare('PRAGMA user_version').get().user_version < 5) {
    if(previousVersion===4&&path!==':memory:')db.prepare('VACUUM INTO ?').run(path+'.v4-backup-'+Date.now());
    try { db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE tasks ADD COLUMN planned_minutes INTEGER NOT NULL DEFAULT 25;
      UPDATE tasks SET planned_minutes=estimate*25;
      PRAGMA user_version=5; COMMIT;`);
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');db.close();throw error;}
  }
  if (db.prepare('PRAGMA user_version').get().user_version < 6) {
    if(previousVersion===5&&path!==':memory:')db.prepare('VACUUM INTO ?').run(path+'.v5-backup-'+Date.now());
    try { db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE sessions ADD COLUMN timer_mode TEXT NOT NULL DEFAULT 'down';
      ALTER TABLE user_settings ADD COLUMN early_deadline TEXT NOT NULL DEFAULT '09:00';
      CREATE TABLE early_checkins(user_id INTEGER NOT NULL REFERENCES users(id),day TEXT NOT NULL,checked_at TEXT NOT NULL,deadline TEXT NOT NULL,PRIMARY KEY(user_id,day));
      CREATE TABLE focus_segments(id INTEGER PRIMARY KEY,session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,started_at INTEGER NOT NULL,ended_at INTEGER);
      CREATE INDEX segments_session ON focus_segments(session_id);
      PRAGMA user_version=6; COMMIT;`);
    }catch(error){if(db.isTransaction)db.exec('ROLLBACK');db.close();throw error;}
  }
  return db;
}
