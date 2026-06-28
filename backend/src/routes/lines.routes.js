const router = require('express').Router();
const Line = require('../models/Line');
const RoutePattern = require('../models/RoutePattern');
const Stop = require('../models/Stop');

// GET /api/lines
router.get('/', async (req, res, next) => {
  try {
    const lines = await Line.find({ isActive: true }).sort({ shortName: 1 });
    res.json({ success: true, data: lines });
  } catch (err) { next(err); }
});

// GET /api/lines/:id
router.get('/:id', async (req, res, next) => {
  try {
    const line = await Line.findById(req.params.id);
    if (!line) return res.status(404).json({ success: false, error: 'Line not found' });

    const patterns = await RoutePattern.find({ lineId: line._id });
    res.json({ success: true, data: { line, patterns } });
  } catch (err) { next(err); }
});

// GET /api/lines/:id/stops
router.get('/:id/stops', async (req, res, next) => {
  try {
    const line = await Line.findById(req.params.id);
    if (!line) return res.status(404).json({ success: false, error: 'Line not found' });

    const pattern = await RoutePattern.findOne({ lineId: line._id }).populate('stops.stopId');
    if (!pattern) return res.json({ success: true, data: [] });

    const stops = pattern.stops
      .sort((a, b) => a.sequence - b.sequence)
      .map(s => ({ ...s.stopId?.toObject(), sequence: s.sequence, distanceFromStartKm: s.distanceFromStartKm }));

    res.json({ success: true, data: stops });
  } catch (err) { next(err); }
});

// GET /api/lines/:id/path
router.get('/:id/path', async (req, res, next) => {
  try {
    const line = await Line.findById(req.params.id);
    if (!line) return res.status(404).json({ success: false, error: 'Line not found' });

    const pattern = await RoutePattern.findOne({ lineId: line._id });
    if (!pattern) return res.json({ success: true, data: null });

    res.json({ success: true, data: { polyline: pattern.polyline, routeId: pattern.routeId, usedFallbackPath: pattern.usedFallbackPath } });
  } catch (err) { next(err); }
});

module.exports = router;
