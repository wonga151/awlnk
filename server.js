const path = require('path')
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const yup = require('yup');
const monk = require('monk');
const { nanoid } = require('nanoid');

require('dotenv').config();

const db = monk(process.env.MONGO_URI);

const urls = db.get('urls');

urls.createIndex({ slug: "text" }, { unique: true });

const app = express();

app.use(helmet());
app.use(morgan('tiny'));
app.use(cors());
app.use(express.json());

var distDir = __dirname + "/dist";
app.use(express.static(distDir));
app.use(express.static('./public'));



app.get('/url/:slug', async (req, res, next) => {
  const { slug: slug } = req.params;

  try {
    const url = await urls.findOne({ slug });
    if (url) {
      res.json(url.url);
    }
    else {
      res.json({ message: "No url associated with this slug." })
    }
  } catch (error) {
    next(error)
  }
})

app.get('/search/:slug', async (req, res, next) => {
  const { slug: slug } = req.params;

  var regEx = new RegExp(`.*${slug}.*`, 'g')
  try {

    const slugs = await urls.find(
      { slug: regEx },
      { _id: 0 }
    )


    if (slugs) {
      res.json(slugs);
    }
    else {
      res.json({ message: `Error matching: ${slug}.` })
    }
  } catch (error) {
    next(error)
  }
})

const notFoundPath = path.join(__dirname, '/public/404.html');
app.get('/:id', async (req, res) => {
  const { id: slug } = req.params;

  try {
    const url = await urls.findOne({ slug });
    if (url) {
      res.redirect(url.url);
    }
    else {
      console.log("Slug: " + slug + " not found")
      res.status(404).sendFile(notFoundPath)
    }
  } catch (error) {
    console.log(error)
    res.status(404).sendFile(notFoundPath)

  }
})

const schema = yup.object().shape({
  slug: yup.string().trim().matches(/[\w\-]/i),
  url: yup.string().trim().matches(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&=]*)/g).required(),
})

app.post('/url', async (req, res, next) => {
  let { slug, url } = req.body;
  console.log(req.body)

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  try {
    await schema.validate({
      slug,
      url
    })

    if (!slug) {
      slug = nanoid(5);
    }

    slug = slug.toLowerCase();
    const newUrl = {
      slug,
      url
    }
    const created = await urls.insert(newUrl);
    res.json(created)

  } catch (error) {
    var status
    if (error.message.startsWith("E11000")) {
      error.message = "Slug in use."
      status = 409;
      res.status(409)
    }
    else {
      status = 400
      error.message = "Invalid URL"
      res.status(status)
    }
    res.json({ message: error.message, status: status })
  }
})

app.use((error, req, res, next) => {
  if (error.status) {
    res.status(error.status)
  } else {
    res.status(500);
  }
  res.json({
    message: error.message,
    stack: process.env.NODE_ENV === 'production' ? 'error' : error.stack
  })
})

const port = process.env.PORT || 3080;
app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`)
})