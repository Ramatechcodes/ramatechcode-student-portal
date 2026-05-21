const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const axios = require("axios");

dotenv.config();

const db = require("./firebase");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

function generateStudentId(number){

    const year = new Date().getFullYear();

    return `RAM32-${year}-${String(number).padStart(3,"0")}`;

}

/* EMAIL */

 const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 2525,
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.BREVO_USER,
        pass: process.env.BREVO_PASS
    }
});
/* REGISTER */

app.post("/register", async (req, res) => {

  try {

    const data = req.body;

    const snapshot = await db.collection("students").get();

    const studentId = generateStudentId(snapshot.size + 1);

    // CREATE TX REF
    const tx_ref = "RAM-" + Date.now();

    // SAVE EVERYTHING
    data.studentId = studentId;
    data.tx_ref = tx_ref;
    data.paymentStatus = "pending";
    data.createdAt = Date.now();

    // SAVE TO FIREBASE
    await db.collection("students").add(data);

    // FLUTTERWAVE PAYMENT
    const payment = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: tx_ref,
        amount: 10000,
        currency: "NGN",

        redirect_url:
          "http://localhost:5000/payment-success",

        customer: {
          email: data.email,
          name: data.fullName
        },

        customizations: {
          title: "Ramatechcode Registration",
          description: "Student Registration Payment"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
        }
      }
    );

    res.json({
      success: true,
      paymentLink: payment.data.data.link,
      studentId
    });

  } catch (error) {

    console.log(error);

    res.json({
      success: false,
      message: error.message
    });

  }

});
app.get("/payment-success", async (req, res) => {
  try {

    const tx_ref = req.query.tx_ref;

    const verify = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`
        }
      }
    );

    const payment = verify.data.data;

    if (payment.status !== "successful") {
      return res.send("Payment not successful");
    }

    const snapshot = await db.collection("students")
      .where("tx_ref", "==", tx_ref)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.send("Student not found");
    }

    const doc = snapshot.docs[0];
    const student = doc.data();

   if(
  student.paymentStatus === "paid" &&
  tx_ref.startsWith("RAM-")
){
  return res.send("Already processed");
}
if(tx_ref.startsWith("RAM-")){

  await doc.ref.update({
    paymentStatus: "paid"
  });

}

if(tx_ref.startsWith("COURSE-")){

  await doc.ref.update({
    coursePayment:{
      amount: payment.amount,
      status:"paid",
      paidAt: Date.now()
    }
  });

}

   await transporter.sendMail({
  from: process.env.BREVO_EMAIL,
  to: student.email,
  subject: "Payment Successful - Ramatechcode",
  html: `
    <h2>Welcome ${student.fullName}</h2>
    <p>Your payment is confirmed.</p>
    <h3>Your Student ID: ${student.studentId}</h3>
    <p>You can now login to your dashboard.</p>
  `
});


    res.send("Payment successful");

  } catch (err) {
    console.log(err);
    res.send("Error verifying payment");
  }
});


 app.post("/apply-id", async (req,res)=>{

  try{

    const { studentId } = req.body;

    const snapshot = await db.collection("students")
      .where("studentId","==",studentId)
      .limit(1)
      .get();

    if(snapshot.empty){

      return res.json({
        success:false
      });

    }

    const doc = snapshot.docs[0];

    await doc.ref.update({
      idCardStatus:"pending"
    });

    res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    res.json({
      success:false
    });

  }

});
app.post("/pay-course", async (req,res)=>{

  try{

    const { studentId, amount, percentage } = req.body;

    const snapshot = await db.collection("students")
      .where("studentId","==",studentId)
      .limit(1)
      .get();

    if(snapshot.empty){

      return res.json({
        success:false
      });

    }

    const doc = snapshot.docs[0];

    const student = doc.data();

    const tx_ref = "COURSE-" + Date.now();

    const payment = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref,
        amount,
        currency:"NGN",

        redirect_url:
        "http://localhost:5000/payment-success",

        customer:{
          email:student.email,
          name:student.fullName
        },

        customizations:{
          title:"Ramatechcode Course Payment",
          description:`${percentage} Course Payment`
        }

      },
      {
        headers:{
          Authorization:
          `Bearer ${process.env.FLW_SECRET_KEY}`
        }
      }
    );

    await doc.ref.update({

      coursePayment:{
        amount,
        percentage,
        status:"pending"
      }

    });

    res.json({
      success:true,
      link: payment.data.data.link
    });

  }catch(err){

    console.log(err);

    res.json({
      success:false
    });

  }

});
app.post("/login", async (req, res) => {

  try {

    const { studentId } = req.body;

    const snapshot = await db.collection("students")
      .where("studentId", "==", studentId)
      .get();

    if (snapshot.empty) {
      return res.json({ success: false });
    }

    let student;

    snapshot.forEach(doc => {
      student = doc.data();
    });

    res.json({
      success: true,
      student
    });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }

});
app.post("/student-data", async(req,res)=>{

  try{

    const { studentId } = req.body;

    const snapshot = await db.collection("students")
    .where("studentId","==",studentId)
    .limit(1)
    .get();

    if(snapshot.empty){

      return res.json({
        success:false
      });

    }

    const student = snapshot.docs[0].data();

    res.json({
      success:true,
      student
    });

  }catch(err){

    res.json({
      success:false
    });

  }

});
app.post("/approve-id", async (req, res) => {

  const { id } = req.body;

  await db.collection("students").doc(id).update({
    idCardStatus: "approved"
  });

  res.json({ success: true });

});
/* SUCCESS PAGE */

app.get("/success",(req,res)=>{

    res.send(`

        <h1
            style="
            font-family:Arial;
            text-align:center;
            margin-top:100px;
            "
        >

        Payment Successful

        </h1>

    `);

});

/* ADMIN */

app.get("/students", async(req,res)=>{

    try{

        const snapshot = await db.collection("students").get();

        let students = [];

        snapshot.forEach(doc=>{

            students.push({

                id:doc.id,
                ...doc.data()

            });

        });

        res.json(students);

    }catch(error){

        res.json(error);

    }

});

const PORT = process.env.PORT || 5000;

app.listen(PORT, ()=>{

    console.log(`Server Running On Port ${PORT}`);

});