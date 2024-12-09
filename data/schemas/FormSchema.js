const mongoose = require('mongoose');

const formOptionsSchema = new mongoose.Schema({
    title: { type: String, required: true },
    style: { type: String, enum: ['court', 'long'], required: true },
    minLength: { type: Number, default: 0 },
    maxLength: { type: Number, required: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String }
});

const formResponseSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    userTag: { type: String, required: true },
    responses: [String],
    createdAt: { type: Date, default: Date.now }
});

const formSchema = new mongoose.Schema({
    number: { type: Number, required: true },
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    channel: { type: String, required: true },
    messageContent: { type: String, required: true },
    messageId: { type: String },
    logsChannel: { type: String },
    logsType: { type: String, enum: ['embed', 'update'] },
    logsMessage: { type: String },
    buttonText: { type: String, required: true },
    buttonEmoji: { type: String },
    buttonColor: { type: String, default: 'PRIMARY' },
    options: [formOptionsSchema],
    responses: [formResponseSchema],
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedBy: { type: String },
    updatedAt: { type: Date }
});

module.exports = mongoose.model('Form', formSchema);