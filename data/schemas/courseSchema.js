const mongoose = require('mongoose');

const courseUserSchema = new mongoose.Schema({
    userId: String,
    userTag: String,
    timestamp: Date
});

const raceDataSchema = new mongoose.Schema({
    classification: Array,
    penalties: Array,
    fastestLap: Array,
    entries: Array
});

const courseSchema = new mongoose.Schema({
    type: { 
        type: String, 
        required: true, 
        enum: ['course', 'competition'] 
    },
    courseName: String,
    configChannel: String,
    announcementChannel: String,
    confirmationChannel: String,
    configMessageId: String,
    confirmationMessageId: String,
    confirmationRole: String,
    confirmedUsers: [courseUserSchema],
    isConfirmationPhase: { 
        type: Boolean, 
        default: false 
    },
    isEnded: { 
        type: Boolean, 
        default: false 
    },
    createdBy: String,
    racesCount: Number,
    race1: raceDataSchema,
    race2: raceDataSchema,
    formId: String,
    formData: mongoose.Schema.Types.Mixed,
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

// Assurez-vous que cette ligne est présente et correcte
const Course = mongoose.model('Course', courseSchema);
module.exports = Course;