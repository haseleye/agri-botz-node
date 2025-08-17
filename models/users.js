const {Schema, model} = require('mongoose');
const bcrypt = require('bcrypt');
const mongoose = require("mongoose");

const userSchema = new Schema({
    firstName: {
        type: String,
        required: [true, 'firstNameRequired'],
        maxLength: [20, 'nameMaxLength'],
    },
    lastName: {
        type: String,
        required: [true, 'lastNameRequired'],
        maxLength: [20, 'nameMaxLength'],
    },
    mobile: {
        primary: {country: String, number: String},
        isVerified: Boolean,
        alternate: {country: String, number: String},
    },
    currency: {
        type: String,
        default: process.env.GENERAL_BASE_CURRENCY
    },
    email: {
        primary: {
            type: String,
            validate: {
                validator: (value) => {
                    return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value)
                },
                message: 'invalidEmail'
            }
        },
        isVerified: Boolean,
        alternate: String
    },
    password: {
        type: String,
        required: [true, 'passwordRequired'],
        validate: {
            validator: (value) => {
                const pattern = process.env.SECURITY_PASSWORD_PATTERN
                const regex = new RegExp(pattern)
                return regex.test(value)
            },
            message: 'invalidPassword'
        }
    },
    sites: [
        {
            _id: false,
            id: String,
            name: String,
            gadgets: [
                {
                    _id: false,
                    id: String,
                    name: String,
                    deviceId: String,
                    gps: {
                        lat: Number,
                        long: Number,
                    },
                }
            ],
            isActive: {
                type: Boolean,
                default: false
            },
            isTerminated: {
                type: Boolean,
                default: false
            },
            createdAt: Date,
            activatedAt: Date,
            deactivatedAt: Date,
            terminatedAt: Date
        }
    ],
    plan: {
        type: String,
        default: 'PAYG'
    },
    balance: mongoose.Decimal128,
    courtesy: {
        type: mongoose.Decimal128,
        default: Number(process.env.GENERAL_COURTESY_AMOUNT)
    },
    subscription: {
        savingPlan: {
            name: String,
            price: mongoose.Decimal128,
            credit: mongoose.Decimal128,
            isEffective: Boolean,
            renewal: {
                action: {
                    type: String,
                    enum: {
                        values: ['Renew', 'Cancel']
                    }
                },
                nextSavingPlan: String,
                price: mongoose.Decimal128,
                trigger: {
                    type: String,
                    enum: {
                        values: ['Renewal Date', 'Low Credit'],
                        message: 'invalidTrigger'
                    }
                },
                creditTrigger: mongoose.Decimal128,
                renewalStatus: {
                    type: String,
                    enum: {
                        values: ['Waiting', 'In Progress']
                    }
                }
            },
        },
        services: [{
            name: String,
            price: mongoose.Decimal128,
            isEffective: Boolean,
            renewal: {
                action: {
                    type: String,
                    enum: {
                        values: ['Renew', 'Cancel']
                    }
                }
            },
            settings: Object,
            _id: false
        }],
        renewalDate: Date
    },
    payment: [
        {
            token: String,
            default: Boolean,
            _id: false
        }
    ],
    coupons: [
        {
            code: String,
            usedDate: Date,
            discountAmount: mongoose.Decimal128
        }
    ],
    role: {
        type: String,
        required: [true, 'roleRequired'],
        enum: {
            values: ['ADMIN', 'USER'],
            message: 'invalidRole'
        }
    },
    isActive: {
        isSuspended: {
            type: Boolean,
            default: false
        },
        login: {
            failedTrials: {
                type: Number,
                default: 0
            },
            nextTrial: {
                type: Date,
                default: new Date()
            }
        },
        message: String
    },
});

userSchema.pre('validate', function(next) {
    const user = this;
    if (!user.isModified('role')) return next();

    this.role = this.role.toUpperCase();
    next();
});

userSchema.pre('save', function(next) {
    const user = this;

    // only hash the password if it has been modified (or is new)
    if (!user.isModified('password')) return next();
    const saltWorkFactor = Number(process.env.SECURITY_SALT_WORK_FACTOR);
    const pepperedPassword = user.password + process.env.SECURITY_PASSWORD_PEPPER

    // generate a salt
    bcrypt.genSalt(saltWorkFactor, (err, salt) => {
        if (err) return next(err);

        bcrypt.hash(pepperedPassword, salt, (err, hash) => {
            if (err) return next(err);

            // override the cleartext password with the hashed one
            user.password = hash;
            next();
        })
    })
})

userSchema.methods.comparePassword = function(candidatePassword, cb) {

    const pepperedPassword = candidatePassword + process.env.SECURITY_PASSWORD_PEPPER

    bcrypt.compare(pepperedPassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        cb(null, isMatch);
    });
};

const userModel = model('user', userSchema);

module.exports = userModel;

