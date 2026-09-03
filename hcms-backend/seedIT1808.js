require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const Subject = require('./models/Subject');
const Program = require('./models/Program');
const Department = require('./models/Department');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    let dept = await Department.findOne({ name: 'Information Technology' });
    if (!dept) dept = await Department.create({ name: 'Information Technology' });

    let prog = await Program.findOne({ name: 'BSIT', departmentId: dept._id });
    if (!prog) prog = await Program.create({ name: 'BSIT', departmentId: dept._id });

    let sub = await Subject.findOne({ courseCode: 'IT1808' });
    if (!sub) {
      await Subject.create({
        courseCode: 'IT1808',
        subjectName: 'Integrative Programming',
        programId: prog._id,
        departmentId: dept._id
      });
      console.log("Seeded IT1808");
    } else {
      console.log("IT1808 already exists");
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
seed();
