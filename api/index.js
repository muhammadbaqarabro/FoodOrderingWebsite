const express = require('express');
const app = express();

app.use(express.json());

// Aapke routes
app.get('/api/menu', (req, res) => {
    res.json({ message: "Menu data" });
});

module.exports = app;