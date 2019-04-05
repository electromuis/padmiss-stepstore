const express = require('express')
const bodyParser = require("body-parser");
const cors = require('cors')

const axios = require('axios')
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path')
const { base64encode, base64decode } = require('nodejs-base64');

const app = express()
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use('/storage', express.static('storage'))
app.use(cors())

const port = 80

app.get('/', (req, res) => res.send('Hello World!'))
var api = "https://api.padmiss.com"
var basePath = 'http://electromuis1.openode.io/'

function checkToken(token)
{
    return axios.post(api + '/validate-token', {'token': token})
        .then(resp => {
            return new Promise((resolve, reject) => {
                if(resp.data.success !== true) {
                    reject("Token not valid")
                    return
                }

                let player = resp.data.playerId
                let path = 'storage/' + player + '/'

                mkdirp(path, function (err) {
                    if(err) {
                        reject("Failing finding your space")
                        return
                    }

                    resolve(path)
                })
            })
        })
}

app.post('/add-chart', (req, res) => {
    let ret = {status: "OK"}

    if(!req.body.name || !req.body.file || !req.body.token) {
        ret.status = "ERROR"
        ret.message = "Missing fields"
        res.send(ret)
        return
    }

    checkToken(req.body.token)
        .then((playerPath) => {
            return new Promise((resolve, reject) => {
                fs.readdir(playerPath, (err, files) => {
                    if(files.length >= 10) {
                        reject("Too many files")
                        return
                    }
                    resolve(playerPath)
                });
            })
        })
        .then((playerPath) => {
            return new Promise((resolve, reject) => {
                let name = req.body.name.replace('/', '').replace('\\', '')

                if(path.extname(name) !== '.zip') {
                    reject("Not a valid file")
                    return
                }

                if(req.body.file.length > (1024 ^ 2 * 8)) {
                    reject("File too big: " + req.body.file.length)
                    return
                }

                let data = req.body.file
                fs.writeFile(playerPath + name, data, 'base64', function(err) {
                    if(err) {
                        reject("Failed putting file")
                        return
                    }

                    res.send(ret)
                    resolve()
                    return
                });
            })
        })
        .catch(err => {
            ret.status = "ERROR"
            console.log(err)
            ret.message = err
            res.send(ret)
        })
})

app.get('/get-charts', (req, res) => {
    let ret = {status: "OK"}

    if(!req.query.token) {
        ret.status = "ERROR"
        ret.message = "Missing fields"
        res.send(ret)
        return
    }

    checkToken(req.query.token)
        .then((playerPath) => {
            fs.readdir(playerPath, (err, files) => {
                ret.files = files.map(f => {
                    return {
                        name: f,
                        url: basePath + playerPath + f
                    }
                })

                res.send(ret)
            })
        })
        .catch(err => {
            ret.status = "ERROR"
            console.log(err)
            ret.message = err
            res.send(ret)
        })
})

app.post('/delete-chart', (req, res) => {
    let ret = {status: "OK"}

    if(!req.body.token || !req.body.name) {
        ret.status = "ERROR"
        ret.message = "Missing fields"
        res.send(ret)
        return
    }

    checkToken(req.body.token)
        .then((playerPath) => {
            return new Promise(((resolve, reject) => {
                let filePath = playerPath + '/' + req.body.name

                fs.access(filePath, fs.F_OK, (err) => {
                    if (err) {
                        reject("File doesn't exist")
                        return
                    }

                    fs.unlink(filePath, function (err) {
                        if (err) {
                            reject("Failed deleting")
                            return
                        }

                        res.send(ret)
                        resolve()
                    })
                })
            }))
        })
        .catch(err => {
            ret.status = "ERROR"
            console.log(err)
            ret.message = err
            res.send(ret)
        })
})


app.listen(port, () => console.log(`Example app listening on port ${port}!`))