import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import pool from '../db/pool';

@Injectable()
export class AuthService {
  async signup(email: string, username: string, name: string, password: string) {
    try {
      if (!email || !username || !name || !password) {
        throw new BadRequestException('All fields are required.');
      }

      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username],
      );
      if (existing.rows.length > 0) {
        throw new BadRequestException('Email or username already exists.');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO users (email, username, name, password, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [email, username, name, hashedPassword],
      );
      return { message: 'Signup successful! You can now login.' };
    } catch (err) {
      throw new BadRequestException(err.message || 'Signup failed.');
    }
  }

  async login(email: string, password: string) {
    try {
      const result = await pool.query(
        'SELECT id, email, username, password, name FROM users WHERE email = $1',
        [email],
      );
      if (result.rows.length === 0) {
        throw new Error('Invalid credentials');
      }
      const user = result.rows[0];

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        throw new Error('Invalid credentials');
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
        },
      };
    } catch (err) {
      throw new BadRequestException(err.message || 'Login failed.');
    }
  }
  async updatePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    try {
      if (!currentPassword || !newPassword) {
        throw new BadRequestException('All fields are required.');
      }
      const result = await pool.query('SELECT password FROM users WHERE id = $1', [
        userId,
      ]);
      if (result.rows.length === 0) {
        throw new BadRequestException('User not found.');
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        throw new BadRequestException('Current password is incorrect.');
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [
        hashedPassword,
        userId,
      ]);
      return true;
    } catch (err) {
      throw new BadRequestException(err.message || 'Password update failed.');
    }
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      username: payload.username,
      email: payload.email,
    };
  }

  async resetPassword(email: string, newPassword: string) {
    try {
      if (!email || !newPassword) {
        throw new BadRequestException('Email and new password are required.');
      }

      const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [
        email,
      ]);

      if (userResult.rows.length === 0) {
        throw new BadRequestException('User not found.');
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = $1 WHERE email = $2', [
        hashedPassword,
        email,
      ]);
      return { message: 'Password reset successful.' };
    } catch (err) {
      throw new BadRequestException(err.message || 'Password reset failed.');
    }
  }
}