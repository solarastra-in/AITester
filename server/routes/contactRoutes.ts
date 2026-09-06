import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

export const contactRouter = Router();

export interface ContactSubmission {
  name: string;
  email: string;
  company?: string;
  category: string;
  message: string;
  priority?: string;
}

// POST /api/contact - Submit contact inquiry
contactRouter.post('/', (req: Request, res: Response) => {
  const { name, email, company, category, message, priority }: ContactSubmission = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Please provide your name.' });
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Please provide a valid business email address.' });
  }

  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    return res.status(400).json({ error: 'Please provide a descriptive message (at least 5 characters).' });
  }

  const ticketId = `VRTY-CNT-${Math.floor(100000 + Math.random() * 900000)}`;
  const inquiryRecord = {
    id: uuidv4(),
    ticketId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: (company || '').trim(),
    category: category || 'General Support',
    message: message.trim(),
    priority: priority || 'Standard',
    status: 'received',
    receivedAt: new Date().toISOString(),
  };

  // Add system audit log
  try {
    db.addAuditLog(
      'system',
      email.trim().toLowerCase(),
      'CONTACT_INQUIRY_SUBMITTED',
      `Contact inquiry #${ticketId} submitted by ${name.trim()} (${company || 'Individual'}): category="${inquiryRecord.category}", priority="${inquiryRecord.priority}"`
    );
    db.save();
  } catch (err) {
    console.warn('Could not record contact audit log:', err);
  }

  res.status(201).json({
    ok: true,
    ticketId,
    message: `Thank you, ${name.trim()}. Your inquiry #${ticketId} has been registered. Our QA solutions engineering team will reply within 2 hours.`,
    inquiry: inquiryRecord,
  });
});

// GET /api/contact/categories - Public contact category catalog
contactRouter.get('/categories', (_req: Request, res: Response) => {
  res.json({
    categories: [
      { id: 'enterprise', label: 'Enterprise Dedicated Cluster & VPC Deployment', sla: 'Sub-1 hour SLA' },
      { id: 'support', label: 'Technical QA Automation & Framework Support', sla: 'Same-day response' },
      { id: 'custom_routes', label: 'Model Routing & Custom Protocol Integration', sla: 'Same-day response' },
      { id: 'security', label: 'Security, SOC-2 Compliance & Data Privacy', sla: '24-hour response' },
      { id: 'billing', label: 'Billing, Enterprise Invoicing & Credit Grants', sla: 'Same-day response' },
      { id: 'feedback', label: 'Feature Proposal & Engineering Feedback', sla: 'Reviewed weekly' },
    ],
    supportChannels: [
      { channel: 'Global Enterprise Desk', email: 'enterprise@verity-qa.dev', hours: '24/7/365' },
      { channel: 'Technical QA Community', email: 'support@verity-qa.dev', hours: 'Mon–Fri 08:00–20:00 UTC' },
      { channel: 'Security & Compliance Officer', email: 'security@verity-qa.dev', hours: '24/7 Critical Incidents' },
    ],
  });
});
