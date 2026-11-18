'use strict';

const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { listDepartments } = require('./department.service');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const departments = await listDepartments();
    res.json({ data: departments.map((d) => ({ code: d.code, name: d.name, displayOrder: d.displayOrder })) });
  })
);

module.exports = router;
