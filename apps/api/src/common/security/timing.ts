import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

let dummyHash: Promise<string> | null = null;

/**
 * عند إدخال إيميل غير موجود نعمل تحقق argon2 وهمي بنفس التكلفة، عشان زمن الرد
 * ما يكشفش هل الإيميل مسجل في النظام ولا لأ (User enumeration via timing).
 */
export async function burnPasswordVerification(password: string): Promise<void> {
  if (!dummyHash) {
    dummyHash = argon2.hash(randomBytes(16).toString('hex'), {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }
  await argon2.verify(await dummyHash, password || '').catch(() => false);
}
