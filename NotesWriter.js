
module.exports = class NotesWriter {
    constructor() {
        this.data = ""
        this.info = {}

        this.tags = [
            'TITLE',
            'SUBTITLE',
            'ARTIST',
            'TITLETRANSLIT',
            'SUBTITLETRANSLIT',
            'ARTISTTRANSLIT',
            'GENRE',
            'CREDIT',
            'BANNER',
            'BACKGROUND',
            'LYRICSPATH',
            'CDTITLE',
            'MUSIC',
            'OFFSET',
            'SAMPLESTART',
            'SAMPLELENGTH'
        ]

        this.splitTags = [
            'BPMS',
            'STOPS',
            'BGCHANGES',
            'FGCHANGES',
            'KEYSOUNDS',
            'ATTACKS'
        ]

        this.chartFields = ['type', 'credit', 'diff', 'level', 'meter']
        this.out = []
        this.charts = []
    }

    setData(data) {
        this.data = data
    }

    read() {
        let me = this

        let lines = this.data.split("\n")
        let mode = "normal"
        let c = 0

        let re1 = /^#(\w+):([^;]*);$/
        let re2 = /;$/
        let re3 = /\s*(.*)\s*\/\/(.*)$/
        let re4 = /^(.*):$/

        let chart = null

        let notes = []

        let buff = ""

        lines.forEach(l => {
            l = l.trim()

            let match = re3.exec(l)
            if(match !== null) {
                l = match[1]
            }

            l = l.trim()
            if(l.length === 0) {
                return
            }

            if(mode === "normal") {
                let match = re1.exec(l)
                if(match) {
                    me.handleLine(match)
                } else {
                    if(l === '#NOTES:') {

                        if(chart !== null) {
                            me.charts.push(chart)
                        }

                        notes = []
                        chart = {notes: []}
                        mode = "chart"
                        c = 0
                    } else {
                        buff = l
                        mode = "buffer"
                    }
                }
            } else if (mode === "buffer") {
                buff += l
                if(re2.exec(l)) {
                    mode = "normal"

                    let match = re1.exec(buff)
                    if(match) {
                        me.handleLine(match)

                        return
                    } else {
                        //todo
                    }
                }
            } else if (mode ===  'chart') {
                if(c < me.chartFields.length) {
                    let match = re4.exec(l)
                    if(match) {
                        chart[me.chartFields[c]] = match[1]
                        c++
                    } else {
                        //ignore?
                    }
                }

                if(c >= me.chartFields.length) {
                    mode = 'notes'
                }

            } else if (mode === 'notes') {
                if(l === ',') {
                    chart.notes.push(notes)
                    notes = []
                } else if (l === ';') {
                    chart.notes.push(notes)
                    me.charts.push(chart)
                    chart = null
                    mode = 'normal'
                } else {
                    notes.push(l)
                }
            }
        })

        if(chart !== null) {
            me.charts.push(chart)
        }
    }

    handleLine(matches) {
        if(matches.length !== 3) {
            //todo
            return
        }

        let me = this

        let key = matches[1]
        let val = matches[2]

        if(val.length === 0) {
            return
        }

        if(this.splitTags.includes(key)) {
            val = val.split(',').map(i => i.trim())

            if(['STOPS', 'BPMS'].includes(key)) {
                val = val.map(i => {
                    let pts = i.split('=')
                    if(pts.length !== 2) {
                        //todo
                        return i
                    }

                    return me.formatDec(pts[0]) + '=' + me.formatDec(pts[1])
                })
            }
        }

        this.info[key] = val
    }

    formatDec(i) {
        i = parseFloat(i)
        return i.toFixed(6)
    }

    write() {
        this.out = []

        this.writeHeader()
        this.writeCharts()

        let ret = ""
        this.out.forEach(l => {
            ret += l + "\n"
        })
        return ret
    }

    writeHeader() {
        let me = this

        this.tags.forEach(t => {
            let val = ""
            if(me.info[t]) {
                val = me.info[t]
            }
            this.writeTag(t, val)
        })

        this.writeTag('SELECTABLE', 'YES')

        if(this.info.DISPLAYBPM) {
            this.writeTag('DISPLAYBPM', this.info.DISPLAYBPM)
        }

        this.splitTags.forEach(t => {
            let val = ""
            if(me.info[t]) {
                if(Array.isArray(me.info[t])) {
                    if (['STOPS', 'BPMS'].includes(t)) {
                        val = me.info[t].join(",\n") + "\n"
                    } else {
                        val = me.info[t].join(',')
                    }
                } else {
                    //todo
                }
            } else {
                if(['STOPS', 'BPMS'].includes(t)) {
                    val = "\n"
                }
            }

            if(t === 'FGCHANGES' && val.length === 0) {
                return
            }

            this.writeTag(t, val)
        })
    }

    calcLength(chart) {
        if(this.info['BPMS'] && Array.isArray(this.info['BPMS']) && this.info['BPMS'].length > 0) {
          //todo make anti statement
        } else {
            return
        }

        let notes = chart.notes
        let bpms = []
        let lastBeatInt = notes.length * 4

        this.info['BPMS'].forEach(b => {
            let pts = b.split('=')
            if(pts.length !== 2) {
                //todo
                return
            }

            let beat = parseFloat(pts[0])
            if(beat > lastBeatInt) {
                //We dont care about speedchanges after our last beat
                return
            }

            bpms.push([beat, parseFloat(pts[1])])
        })

        //seconds
        let length = 0

        //Check first bpm = 0
        if(typeof bpms[0] === undefined) {
            //todo
            return
        }

        let fromBeat = 0
        let bpm = 0



        //Becuase NO AUDIO FILES, this might be fine
        let lastBeat = lastBeatInt

        //Does song time end at last note, or after last measure?
        // let lastBeat = 0
        // let lastBeatNotes = notes[notes.length - 1].reverse()
        // let division = lastBeatNotes[lastBeatNotes.length - 1].length;
        // let noteDivision = 0
        //
        // for(let i = 0; i < lastBeatNotes.length; i++) {
        //     if(lastBeatNotes[i].replace('0', '').length !== 0) {
        //         noteDivision = division - i
        //         break;
        //     }
        // }
        //
        // if(noteDivision > 0) {
        //     lastBeat = (lastBeatInt - 1) + (noteDivision / division)
        // } else {
        //     //todo
        // }


        //Calculate length for all beats
        for (let i = 0; i < bpms.length; i++) {
            bpm = bpms[i][1]
            let toBeat = 0

            if(typeof bpms[i+1] !== 'undefined') {
                toBeat = bpms[i+1][0]
            }
            else {
                toBeat = lastBeat
            }

            let beats = toBeat - fromBeat
            let duration = 0

            if(bpm > 0) {
                duration = 60 * beats / bpm
            } else {
                //todo, test this
                duration = 60 * beats / Math.abs(bpm)
            }

            length += duration

            fromBeat = toBeat
        }

        //Apply music offset
        if(typeof this.info['OFFSET'] !== 'undefined') {
            let offset = parseFloat(this.info['OFFSET'])
            length -= offset
        }

        if(typeof this.info['STOPS'] !== 'undefined') {
            this.info['STOPS'].forEach(b => {
                let pts = b.split('=')
                if (pts.length !== 2) {
                    //todo
                    return
                }

                let beat = parseFloat(pts[0])
                let val = parseFloat(pts[1])

                //todo test negative stops
                length += val
            })
        }

        return length
    }

    writeChartNotes(chart, to) {
        let first = true
        let i = 1

        chart.notes.forEach(n => {
            if(first === false) {
                to.push(',  // measure ' + i)
                i++
            } else {
                to.push('  // measure 0')
            }

            n.forEach(l => {
                to.push(l)
            })

            first = false
        })
        to.push('')
    }

    writeCharts() {
        let me = this

        me.charts.forEach(chart => {
            me.out.push("")
            me.out.push("//---------------" + chart.type + " - " + chart.credit +"----------------")
            me.out.push('#NOTES:')
            me.chartFields.forEach(f => {
                me.out.push('     ' + chart[f] + ':')
            })

            me.writeChartNotes(chart, me.out)
            me.out.push(';')
        })
    }

    writeTag(tag, val) {
        this.out.push("#" + tag + ":" + val + ";")
    }
}