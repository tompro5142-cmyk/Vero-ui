
import axios from "axios"
import FormData from "form-data"
import fs from "fs"
import path from "path"

export default function imgPromptRoute(app) {
  const settingsPath = path.join(process.cwd(), "src", "settings.json")
  let settings = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"))
  } catch (e) {
    settings = {}
  }
  const uploadSettings = settings.uploadSettings || {}

  app.get("/ai/imgprompt", async (req, res) => {
    try {
      const { imageUrl } = req.query
      
      if (!imageUrl) {
        return res.status(400).json({
          status: false,
          error: "Image URL is required",
          message: "Please provide an imageUrl parameter"
        })
      }

      // Download the image first
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!imageResponse.data) {
        return res.status(400).json({
          status: false,
          error: "Failed to download image",
          message: "Could not download image from the provided URL"
        })
      }

      // Create form data for NeuralFrames API
      const form = new FormData()
      form.append("file", imageResponse.data, {
        filename: "image.jpg",
        contentType: "image/jpeg"
      })

      // Send to NeuralFrames API
      const neuralResponse = await axios.post("https://be.neuralframes.com/clip_interrogate/", form, {
        headers: {
          ...form.getHeaders(),
          "Authorization": "Bearer uvcKfXuj6Ygncs6tiSJ6VXLxoapJdjQ3EEsSIt45Zm+vsl8qcLAAOrnnGWYBccx4sbEaQtCr416jxvc/zJNAlcDjLYjfHfHzPpfJ00l05h0oy7twPKzZrO4xSB+YGrmCyb/zOduHh1l9ogFPg/3aeSsz+wZYL9nlXfXdvCqDIP9bLcQMHiUKB0UCGuew2oRt",
          "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
          "Referer": "https://www.neuralframes.com/tools/image-to-prompt"
        },
        timeout: 30000
      })

      const prompt = neuralResponse.data?.caption || neuralResponse.data?.prompt

      if (!prompt) {
        return res.status(500).json({
          status: false,
          error: "No prompt generated",
          message: "The AI could not generate a prompt from this image"
        })
      }

      res.json({
        status: true,
        prompt: prompt
      })

    } catch (error) {
      console.error("Image to Prompt Error:", error.message)
      
      if (error.response?.status === 401) {
        return res.status(500).json({
          status: false,
          error: "API authentication failed",
          message: "The image-to-prompt service is currently unavailable"
        })
      }
      
      if (error.code === 'ECONNABORTED') {
        return res.status(408).json({
          status: false,
          error: "Request timeout",
          message: "The image processing took too long. Please try again."
        })
      }

      res.status(500).json({
        status: false,
        error: "Image processing failed",
        message: error.message || "An error occurred while processing the image"
      })
    }
  })

  // Alternative endpoint for base64 image data OR multipart upload 'file'
  app.post("/ai/imgprompt", async (req, res) => {
    try {
      let imageBuffer = null

      // 1) multipart/form-data via express-fileupload
      if (req.files && (req.files.file || req.files['files[]'])) {
        let uploaded = req.files.file || req.files['files[]']
        const filesArray = Array.isArray(uploaded) ? uploaded : [uploaded]

        // validation
        const maxFiles = uploadSettings.maxFilesPerRequest || 5
        if (filesArray.length > maxFiles) {
          return res.status(400).json({ status: false, error: "Too many files", message: `Max ${maxFiles} files allowed` })
        }

        for (const f of filesArray) {
          const maxBytes = (uploadSettings.maxFileSizeMB || 5) * 1024 * 1024
          if (f.size > maxBytes) {
            return res.status(413).json({ status: false, error: "File too large", message: `${f.name} exceeds the ${uploadSettings.maxFileSizeMB || 5}MB limit` })
          }
          // simple mime check
          if (uploadSettings.allowedMimeTypes && Array.isArray(uploadSettings.allowedMimeTypes) && uploadSettings.allowedMimeTypes.length) {
            const ok = uploadSettings.allowedMimeTypes.some((pattern) => {
              if (pattern === "*/*") return true
              if (pattern.endsWith("/*")) return f.mimetype.startsWith(pattern.replace("/*", "/"))
              return f.mimetype === pattern
            })
            if (!ok) {
              return res.status(415).json({ status: false, error: "Unsupported media type", message: `Mimetype ${f.mimetype} not allowed` })
            }
          }
        }

        // use first file for prompt
        const fileObj = filesArray[0]
        if (fileObj.data && Buffer.isBuffer(fileObj.data)) {
          imageBuffer = fileObj.data
        } else if (fileObj.tempFilePath && fs.existsSync(fileObj.tempFilePath)) {
          imageBuffer = fs.readFileSync(fileObj.tempFilePath)
        } else {
          return res.status(400).json({ status: false, error: "Invalid file", message: "Uploaded file is missing or unreadable" })
        }
      } else if (req.body?.imageData) {
        // 2) base64 payload (legacy)
        const base64Data = req.body.imageData.replace(/^data:image\/\w+;base64,/, "")
        imageBuffer = Buffer.from(base64Data, 'base64')
      } else {
        return res.status(400).json({
          status: false,
          error: "Image data is required",
          message: "Please provide imageData in base64 format or upload a file in form field 'file'"
        })
      }

      // Create form data for NeuralFrames API
      const form = new FormData()
      form.append("file", imageBuffer, {
        filename: "image.jpg",
        contentType: "image/jpeg"
      })

      // Send to NeuralFrames API
      const neuralResponse = await axios.post("https://be.neuralframes.com/clip_interrogate/", form, {
        headers: {
          ...form.getHeaders(),
          "Authorization": "Bearer uvcKfXuj6Ygncs6tiSJ6VXLxoapJdjQ3EEsSIt45Zm+vsl8qcLAAOrnnGWYBccx4sbEaQtCr416jxvc/zJNAlcDjLYjfHfHzPpfJ00l05h0oy7twPKzZrO4xSB+YGrmCyb/zOduHh1l9ogFPg/3aeSsz+wZYL9nlXfXdvCqDIP9bLcQMHiUKB0UCGuew2oRt",
          "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
          "Referer": "https://www.neuralframes.com/tools/image-to-prompt"
        },
        timeout: 30000
      })

      const prompt = neuralResponse.data?.caption || neuralResponse.data?.prompt

      if (!prompt) {
        return res.status(500).json({
          status: false,
          error: "No prompt generated",
          message: "The AI could not generate a prompt from this image"
        })
      }

      res.json({
        status: true,
        prompt: prompt
      })

    } catch (error) {
      console.error("Image to Prompt Error:", error.message)
      
      res.status(500).json({
        status: false,
        error: "Image processing failed",
        message: error.message || "An error occurred while processing the image"
      })
    }
  })
    }
