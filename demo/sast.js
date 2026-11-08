// Intentionally vulnerable: demo for the SAST gate. Never merge.
const express = require('express');
const app = express();

app.get('/calc', (req, res) => res.send(String(eval(req.query.expr))));

module.exports = app;
