const express = require('express')
const bodyParser = require("body-parser")
const cors = require('cors')

const axios = require('axios')
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path')
const { base64encode, base64decode } = require('nodejs-base64')

const { request } = require('graphql-request')
const NotesWriter = require('./NotesWriter.js')
const graphUrl = 'https://api.padmiss.com/graphiql'

const app = express()
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({limit: '15mb'}));
app.use('/storage', express.static('storage'))
app.use(cors())

const port = 80

app.get('/', (req, res) => res.send('Hello World!'))
var api = "https://api.padmiss.com"
var basePath = 'http://electromuis1.openode.io/'

var cabs = {}

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

app.post('/broadcast-cab', (req, res) => {
    let ret = {status: "OK"}

    if(!req.body.token || !req.body.ip) {
        ret.status = "ERROR"
        ret.message = "Missing fields"
        res.send(ret)
        return
    }

    request(graphUrl, `
		{
		  ArcadeCabs (queryString: ` + JSON.stringify(JSON.stringify({apiKey: req.body.token})) + `) {
			docs {
			  _id
              name
			}
		  }
		}
	`).then(data => {
        if(!data.ArcadeCabs || !data.ArcadeCabs.docs) {
            ret.status = "ERROR"
            ret.message = "Token not valid"
            res.send(ret)
            return
        }

        var cab = data.ArcadeCabs.docs[0]
        var date = new Date()
        cab.updatedAt = date.getTime()
        cab.ip = req.body.ip
        cabs[cab._id] = cab

        res.send(ret)
    })

})

app.get('/live-cabs', (req, res) => {
    let ret = {status: "OK", cabs: []}

    Object.entries(cabs).forEach(([k, v]) => {
        var date = new Date()
        var from = date.getTime() - (1000 * 60)

        if(v.updatedAt > from) {
            ret.cabs.push(v)
        }
    })

    res.send(ret)
})

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

                //Already handled by express
                // if(req.body.file.length > (1024 ^ 2 * 8)) {
                //     reject("File too big: " + req.body.file.length)
                //     return
                // }

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

app.get('/get-stats', (req, res) => {
	request(graphUrl, `
		{
		  Scores (sort: "-playedAt") {
			docs {
			  scoreValue
			  originalScore
			  stepsInfo
			  noteSkin
			  playedAt
			  player {
				_id
				nickname
				shortNickname
			  }
			  stepChart {
				groups,
				stepData
				song {
				  title
				  artist
				}
			  }
			  modsOther {
				name
				value
			  }
			  scoreBreakdown {
				fantastics
				excellents
				greats
				decents
				wayoffs
				misses
				holds
				holdsTotal
			  }
			}
		  }
		}
	`).then(data => {
		let songs = {}
		let path = "Songs"

		data.Scores.docs.forEach(s => {
			let reader = new NotesWriter()
			reader.setData(s.stepChart.stepData)
			reader.read()

			let groups = ['Main']
			groups.forEach(g => {
				reader.charts.forEach(c => {

					let name = path + "/" + g + "/" + s.stepChart.song.title
					let k = c.level + "-" + c.diff

					if(typeof songs[name] === 'undefined')
						songs[name] = {}

					if(typeof songs[name][k] === 'undefined')
						songs[name][k] = []

					songs[name][k].push(s)

				})
			})
		});

		console.log(songs)

		let xml = {
			Test: []
		}

		res.set('Content-Type', 'application/json');
		res.send(JSON.stringify(xml))
        return
	})
	.catch(err => {
		console.log(err)
        res.send(err)
    });
});


app.listen(port, () => console.log(`Example app listening on port ${port}!`))