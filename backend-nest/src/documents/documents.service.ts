import { Injectable } from '@nestjs/common';
import pool from '../db/pool';
import * as fs from 'fs';
import * as path from 'path';
import { GeminiService } from './gemini.service';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class DocumentsService {
  constructor(private readonly geminiService: GeminiService) {}
  async generateQuiz(documentId: number, numQuestions: number) {
    const doc = await this.getDocumentById(documentId);
    const text = await this.extractTextFromPdf(doc.filepath);

    const questions = await this.geminiService.generateQuizQuestions(
      text,
      numQuestions,
    );

    const quizRes = await pool.query(
      'INSERT INTO quizzes (document_id, num_questions) VALUES ($1, $2) RETURNING *',
      [documentId, numQuestions],
    );
    const quiz = quizRes.rows[0];

    for (const q of questions) {
      await pool.query(
        'INSERT INTO quiz_questions (quiz_id, question, options, correct_option) VALUES ($1, $2, $3, $4)',
        [quiz.id, q.question, q.options, q.correct_option],
      );
    }
    return quiz;
  }
  async getQuizzes(documentId: number) {
    const res = await pool.query(
      'SELECT * FROM quizzes WHERE document_id = $1',
      [documentId],
    );
    return res.rows;
  }

  async getQuizQuestions(quizId: number) {
    const res = await pool.query(
      'SELECT * FROM quiz_questions WHERE quiz_id = $1',
      [quizId],
    );
    return res.rows;
  }
  async submitQuiz(quizId: number, answers: number[]) {
    const questions = await this.getQuizQuestions(quizId);
    let score = 0;
    for (let i = 0; i < questions.length; i++) {
      const correct = questions[i].correct_option;
      const userAns = answers[i];
      if (!questions || questions.length === 0) {
        throw new Error('Quiz not found or has no questions');
      }
      if (!Array.isArray(answers) || answers.length !== questions.length) {
        throw new Error(
          'Answers array is missing or does not match number of questions',
        );
      }
      if (userAns === correct) score++;

      await pool.query(
        'UPDATE quiz_questions SET user_answer = $1 WHERE id = $2',
        [userAns, questions[i].id],
      );
    }
    await pool.query(
      'UPDATE quizzes SET score = $1, completed = true, completed_at = NOW() WHERE id = $2',
      [score, quizId],
    );
    return { score, total: questions.length, questions };
  }

  async getAllDocuments() {
    const result = await pool.query('SELECT * FROM documents');
    return result.rows;
  }

  async getDocumentsByUserId(userId: number) {
    const result = await pool.query(
      'SELECT * FROM documents WHERE user_id = $1 ORDER BY uploaded_at DESC',
      [userId],
    );
    return result.rows;
  }

  async saveDocument(doc: any) {
    const { user_id, title, filename, filesize, filepath } = doc;
    const result = await pool.query(
      'INSERT INTO documents (user_id, title, filename, filesize, filepath) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, title, filename, filesize, filepath],
    );
    return result.rows[0];
  }

  async deleteDocument(id: number) {
    const fileResult = await pool.query(
      'SELECT filepath FROM documents WHERE id = $1',
      [id],
    );

    if (fileResult.rows.length === 0) return false;

    const filepath = fileResult.rows[0].filepath;

    await pool.query('DELETE FROM documents WHERE id = $1', [id]);

    try {
      await fs.promises.unlink(filepath);
    } catch (err) {
      console.error('File deletion error:', err);
    }

    return true;
  }

  async getDocumentById(id: number) {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [
      id,
    ]);
    return result.rows[0];
  }

  async extractTextFromPdf(filepath: string): Promise<string> {
    try {
      const absolutePath = path.resolve(filepath);
      console.log('[PDF] Reading:', absolutePath);

      if (!fs.existsSync(absolutePath)) {
        console.error('[PDF] File not found');
        return '';
      }

      const dataBuffer = fs.readFileSync(absolutePath);
      const parser = new PDFParse({ data: dataBuffer });
      const parsed = await parser.getText();
      const fullText = parsed.text || '';
      await parser.destroy();

      console.log('[PDF] Extracted chars:', fullText.length);
      return fullText.trim();
    } catch (error) {
      console.error('[PDF] Extraction failed:', error);
      return '';
    }
  }
  async createFlashcardSet(
    documentId: number,
    flashcards: { question: string; answer: string; difficulty?: string }[],
  ) {
    const setRes = await pool.query(
      'INSERT INTO flashcard_sets (document_id) VALUES ($1) RETURNING *',
      [documentId],
    );
    const setId = setRes.rows[0].id;
    for (const card of flashcards) {
      await pool.query(
        'INSERT INTO flashcards (set_id, question, answer, difficulty) VALUES ($1, $2, $3, $4)',
        [setId, card.question, card.answer, card.difficulty || 'EASY'],
      );
    }
    return setId;
  }

  async getFlashcardSets(documentId: number) {
    return (
      await pool.query('SELECT * FROM flashcard_sets WHERE document_id = $1', [
        documentId,
      ])
    ).rows;
  }

  async getFlashcards(setId: number) {
    return (
      await pool.query('SELECT * FROM flashcards WHERE set_id = $1', [setId])
    ).rows;
  }

  async deleteFlashcardSet(setId: number) {
    await pool.query('DELETE FROM flashcards WHERE set_id = $1', [setId]);

    const res = await pool.query(
      'DELETE FROM flashcard_sets WHERE id = $1 RETURNING *',
      [setId],
    );
    return res.rowCount > 0;
  }
  async countDocuments(userId: number) {
    const res = await pool.query(
      'SELECT COUNT(*) FROM documents WHERE user_id = $1',
      [userId],
    );
    return Number(res.rows[0].count);
  }

  async countFlashcards(userId: number) {
    const res = await pool.query(
      `SELECT COUNT(*) FROM flashcards WHERE set_id IN (
      SELECT id FROM flashcard_sets WHERE document_id IN (
        SELECT id FROM documents WHERE user_id = $1
      )
    )`,
      [userId],
    );
    return Number(res.rows[0].count);
  }

  async countQuizzes(userId: number) {
    const res = await pool.query(
      `SELECT COUNT(*) FROM quizzes WHERE document_id IN (
      SELECT id FROM documents WHERE user_id = $1
    )`,
      [userId],
    );
    return Number(res.rows[0].count);
  }

  async deleteQuiz(quizId: number) {
    await pool.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [quizId]);

    const res = await pool.query(
      'DELETE FROM quizzes WHERE id = $1 RETURNING *',
      [quizId],
    );
    return res.rowCount > 0;
  }
  async logActivity({
    userId,
    type,
    documentId,
    quizId,
    durationMinutes,
  }: {
    userId: number;
    type: string;
    documentId?: number;
    quizId?: number;
    durationMinutes?: number;
  }) {
    await pool.query(
      `INSERT INTO activity (user_id, type, document_id, quiz_id, duration_minutes) VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, documentId || null, quizId || null, durationMinutes || 0],
    );
  }
  async getRecentActivity(userId: number) {
    const result = await pool.query(
      `SELECT a.*, 
              d.title AS document_title, 
              q.id AS quiz_id,
              q.document_id AS quiz_document_id,
              d2.title AS quiz_document_title
       FROM activity a
       LEFT JOIN documents d ON a.document_id = d.id
       LEFT JOIN quizzes q ON a.quiz_id = q.id
       LEFT JOIN documents d2 ON q.document_id = d2.id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [userId],
    );
    return result.rows
      .map((row) => {
        if (row.type === 'document_access') {
          return {
            title: `Accessed Document: ${row.document_title}`,
            date: new Date(row.created_at).toLocaleString(),
            link: `/documents/${row.document_id}`,
          };
        }
        if (row.type === 'quiz_attempt') {
          const docTitle =
            row.quiz_document_title || row.document_title || 'Unknown';
          const docId = row.quiz_document_id || row.document_id;
          return {
            title: `Attempted Quiz on: ${docTitle}`,
            date: new Date(row.created_at).toLocaleString(),
            link: `/documents/${docId}?tab=quizzes`,
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  async getAnalytics(userId: number) {
    const activities = await pool.query(
      `SELECT * FROM activity WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days' ORDER BY created_at DESC`,
      [userId],
    );

    const timeByDoc = await pool.query(
      `SELECT d.title, COALESCE(SUM(a.duration_minutes), 0) as minutes
     FROM activity a
     JOIN documents d ON a.document_id = d.id
     WHERE a.user_id = $1 AND a.duration_minutes > 0
     GROUP BY d.title
     ORDER BY minutes DESC
     LIMIT 5`,
      [userId],
    );

    const weekSessions = await pool.query(
      `SELECT DATE(created_at) as day, COUNT(DISTINCT DATE(created_at)) as count
   FROM activity
   WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
   GROUP BY DATE(created_at)
   ORDER BY day`,
      [userId],
    );

    return {
      activities: activities.rows,
      timeSpent: timeByDoc.rows,
      weekSessions: weekSessions.rows,
    };
  }

  async logDuration(
    documentId: number,
    userId: number,
    durationMinutes: number,
  ) {
    const result = await pool.query(
      `UPDATE activity 
     SET duration_minutes = duration_minutes + $1 
     WHERE id = (
       SELECT id FROM activity 
       WHERE user_id = $2 AND document_id = $3 
       ORDER BY created_at DESC 
       LIMIT 1
     )
     RETURNING *`,
      [durationMinutes, userId, documentId],
    );

    if (result.rowCount === 0) {
      await pool.query(
        `INSERT INTO activity (user_id, type, document_id, duration_minutes) 
       VALUES ($1, 'document_access', $2, $3)`,
        [userId, documentId, durationMinutes],
      );
    }

    return { success: true };
  }
}
