'use strict';

const noticeService = require('./notice.service');
const revisionService = require('./revision.service');
const audit = require('../audit/audit.service');
const { readExpectedVersion, requireExpectedVersion } = require('../../utils/ifMatch');

/** Controllers handle HTTP only; business rules live in the services. */
const ctx = (req) => audit.contextFromRequest(req);

module.exports = {
  // Public
  async listPublic(req, res) {
    res.json(await noticeService.listPublic(req.user, req.query));
  },
  async getPublic(req, res) {
    res.json({ data: await noticeService.getPublic(req.user, req.params.id) });
  },
  async home(req, res) {
    res.json({ data: await noticeService.publicHome(req.user) });
  },

  // Management
  async list(req, res) {
    res.json(await noticeService.listManagement(ctx(req), req.query));
  },
  async reviewQueue(req, res) {
    res.json(await noticeService.reviewQueue(ctx(req), req.query));
  },
  async create(req, res) {
    res.status(201).json({ data: await noticeService.createNotice(ctx(req), req.body) });
  },
  async get(req, res) {
    res.json({ data: await noticeService.getNoticeForStaff(ctx(req), req.params.id) });
  },
  async update(req, res) {
    const expected = requireExpectedVersion(req);
    res.json({ data: await noticeService.updateNotice(ctx(req), req.params.id, req.body, expected) });
  },
  async remove(req, res) {
    res.json({ data: await noticeService.deleteDraft(ctx(req), req.params.id) });
  },
  async preview(req, res) {
    res.json({ data: await noticeService.previewNotice(ctx(req), req.params.id) });
  },
  async submit(req, res) {
    res.json({ data: await noticeService.submitNotice(ctx(req), req.params.id, readExpectedVersion(req)) });
  },
  async approve(req, res) {
    const result = await noticeService.approveNotice(ctx(req), req.params.id, req.body, readExpectedVersion(req));
    res.json({ data: result.notice, domainEvent: result.domainEvent });
  },
  async reject(req, res) {
    res.json({ data: await noticeService.rejectNotice(ctx(req), req.params.id, req.body.reason, readExpectedVersion(req)) });
  },
  async return(req, res) {
    res.json({ data: await noticeService.returnNotice(ctx(req), req.params.id, req.body.reason, readExpectedVersion(req)) });
  },
  async withdraw(req, res) {
    const result = await noticeService.withdrawNotice(ctx(req), req.params.id, req.body.reason, readExpectedVersion(req));
    res.json({ data: result.notice, domainEvent: result.domainEvent });
  },
  async archive(req, res) {
    const result = await noticeService.archiveNotice(ctx(req), req.params.id, readExpectedVersion(req));
    res.json({ data: result.notice, domainEvent: result.domainEvent });
  },
  async placement(req, res) {
    const expected = requireExpectedVersion(req);
    res.json({ data: await noticeService.updatePlacement(ctx(req), req.params.id, req.body, expected) });
  },

  // Revisions
  async listRevisions(req, res) {
    res.json({ data: await revisionService.listRevisions(ctx(req), req.params.id) });
  },
  async createRevision(req, res) {
    const result = await revisionService.createCorrection(ctx(req), req.params.id, req.body);
    res.status(201).json({ data: result.revision, notice: result.notice });
  },
  async diff(req, res) {
    res.json({ data: await revisionService.diffRevision(ctx(req), req.params.id, req.params.revId) });
  },
  async approveRevision(req, res) {
    const result = await revisionService.approveCorrection(ctx(req), req.params.id, req.params.revId);
    res.json({ data: result.notice, domainEvent: result.domainEvent });
  },
  async rejectRevision(req, res) {
    const result = await revisionService.rejectCorrection(ctx(req), req.params.id, req.params.revId, req.body.reason);
    res.json({ data: result.notice });
  },
};
