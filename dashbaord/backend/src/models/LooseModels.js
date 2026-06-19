import mongoose from 'mongoose';

const looseOptions = { strict: false, timestamps: false };
const pointSchema = new mongoose.Schema({
  type: { type: String, default: 'Point' },
  coordinates: [Number]
}, { _id: false, strict: false });
const lineSchema = new mongoose.Schema({
  type: { type: String, default: 'LineString' },
  coordinates: [[Number]]
}, { _id: false, strict: false });

export const Route = mongoose.models.Route || mongoose.model('Route', new mongoose.Schema({ routeId: { type: String, index: true }, stops: Array }, looseOptions));
export const Stop = mongoose.models.Stop || mongoose.model('Stop', new mongoose.Schema({ stopId: { type: String, index: true }, location: pointSchema }, looseOptions));
export const RoutePath = mongoose.models.RoutePath || mongoose.model('RoutePath', new mongoose.Schema({ routeId: { type: String, index: true }, geometry: lineSchema }, looseOptions), 'routepaths');
export const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', new mongoose.Schema({ plate: { type: String, index: true } }, looseOptions));
export const Driver = mongoose.models.Driver || mongoose.model('Driver', new mongoose.Schema({}, looseOptions));
export const Schedule = mongoose.models.Schedule || mongoose.model('Schedule', new mongoose.Schema({}, looseOptions));
export const Trip = mongoose.models.Trip || mongoose.model('Trip', new mongoose.Schema({ status: String, startTime: Date }, looseOptions));
export const EtaPrediction = mongoose.models.EtaPrediction || mongoose.model('EtaPrediction', new mongoose.Schema({}, looseOptions), 'etapredictions');
export const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', new mongoose.Schema({}, looseOptions));
export const Payment = mongoose.models.Payment || mongoose.model('Payment', new mongoose.Schema({}, looseOptions));
export const Incident = mongoose.models.Incident || mongoose.model('Incident', new mongoose.Schema({ status: String, createdAt: Date }, looseOptions));
export const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', new mongoose.Schema({}, looseOptions));
export const ImportJob = mongoose.models.ImportJob || mongoose.model('ImportJob', new mongoose.Schema({}, looseOptions), 'importjobs');
export const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting', new mongoose.Schema({}, looseOptions), 'systemsettings');
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', new mongoose.Schema({}, looseOptions), 'auditlogs');

