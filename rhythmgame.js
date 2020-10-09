/**
 *  Rhythmgame -- An HTML5-based Rhythm-game engine.
 *  Copyright (C) 2017  Moriya Kazumi <kuroclef@gmail.com>
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

"use strict";
(async () => {
  const number_of_lanes = 8

  /**
   * Enumeration of Layer on Stage
   */
  const Layer = Object.freeze({
    BACKGROUND : 0,
    JUDGELINE  : 1,
    CONTAINER  : 2,
    TEXTEFFECT : 3
  })

  /**
   * Enumeration of Judge
   */
  const Judge = Object.freeze({
    BAD    : 0,
    COOL   : 1,
    GREAT  : 2,
    GOOD   : 3
  })

  /**
   * Structure of Note
   */
  class Note {
    constructor(time, timeln, lifetime, delay_judge) {
      this.time        = parseFloat(time)
      this.timeln      = parseFloat(timeln)
      this.lifetime    = parseFloat(lifetime)
      this.delay_judge = parseFloat(delay_judge)
    }

    get timestamp() {
      return Math.max(this.time, this.timeln)
    }
  }

  /**
   * Structure of Lane [ Note ... ]
   */
  class Lane {
    constructor(element = null) {
      this._array = []
      this._first = 0
      this.length = 0
      if (element !== null) this.push(element)
    }

    at(i) {
      return this._array[this._first + i]
    }

    at_last() {
      return this._array[this.length - 1]
    }

    push(element) {
      this._array.push(element)
      this.length++
      return this
    }

    terminate(element) {
      this._array.push(element)
      return this
    }

    shift() {
      this._first++
      this.length--
    }

    rewind() {
      this.length += this._first
      this._first  = 0
    }
  }

  /**
   * Structure of Timestamp
   */
  class Timestamp {
    constructor(time) {
      this.time = parseFloat(time)
    }
  }

  /**
   * Structure of Checkpoint [ Timestamp ... ]
   */
  class Checkpoint extends Lane {}

  /**
   * Structure of Moment
   */
  class Moment {
    constructor(second, time, velocity, bpm) {
      this.second   = parseFloat(second)
      this.time     = parseFloat(time)
      this.velocity = parseFloat(velocity)
      this.bpm      = parseFloat(bpm)
    }
  }

  /**
   * Structure of Timeline [ Moment ... ]
   */
  class Timeline extends Lane {
    forward(second) {
      while (this.at(1).second <= second) this.shift()
      return this.at(0)
    }

    forward_tmp(second) {
      return this._array.find((_, i, a) => a[i + 1].second > second)
    }
  }

  /**
   * Structure of Buffer
   */
  class Buffer extends Array {}

  /**
   * Structure of Drawbuffer [ Buffer ... ]
   */
  class Drawbuffer {
    constructor(length) {
      this._buffer = [ ...new Buffer(length) ]
      this.length  = 0
    }

    at(i) {
      return this._buffer[i]
    }

    push(rect) {
      this._buffer[this.length] = rect
      this.length++
      return this
    }

    clear() {
      this._buffer.map(() => null)
      this.length = 0
    }
  }

  /**
   * Score
   */
  class Score {
    constructor(totalnotes) {
      this.judges     = Object.keys(Judge).map(() => 0)
      this.combo      = 0
      this.maxcombo   = 0
      this.totalnotes = totalnotes
    }

    get point() {
      return Math.trunc((this.judges[Judge.COOL] * 3 + this.judges[Judge.GREAT] * 2 + this.maxcombo) / (this.totalnotes * 4) * 100000)
    }
  }

  /**
   * Rhythmgame
   */
  class Rhythmgame {
    fetch(url) {
      if (typeof url === `object`) return this._proc(url)
      if (typeof url !== `string`) return url
      if (!url.includes(`.`))      return url

      const suffix = url.slice(url.lastIndexOf(`.`) + 1)
      switch (suffix) {
      case `png` :
        return fetch(url)
          .then(response => response.blob())
          .then(blob => {
            const image = new Image()
            image.src   = URL.createObjectURL(blob)
            return image
          })

      case `ogg` : case `mp3` :
        return fetch(url)
          .then(response => response.blob())
          .then(blob => new Audio(URL.createObjectURL(blob)))

      case `ssc` :
        return fetch(url)
          .then(response => response.text())
          .then(text => this._parse(new StepMania(), text))

      case `txt` :
        return fetch(url)
          .then(response => response.text())
          .then(text => this._parse(new DancingOnigiri(), text))

      case `json` :
        return fetch(url)
          .then(response => response.json())
          .then(json => this._proc(json))

      default :
        return url
      }
    }

    async _proc(settings) {
      const s = Object.entries(settings)
      for (const [ k, v ] of s) settings[k] = await this.fetch(v)
      return settings
    }

    _parse(driver, notechart) {
      rhythmgame.driver = driver
      return driver.parse(notechart)
    }

    prepare_stage() {
      const container = document.querySelector(`div#stage`)
      Object.assign(container.style, layout.stage)
      return Object.keys(Layer).map((_, i) => {
        const canvas  = document.createElement(`canvas`)
        canvas.width  = parseInt(container.style.width)
        canvas.height = parseInt(container.style.height)
        container.appendChild(canvas)
        return Object.assign(canvas.getContext(`2d`), {
          font         : `300 48px Open Sans`,
          textAlign    : `center`,
          textBaseline : `middle`
        })
      })
    }

    setup(scene) {
      stage.forEach(layer => layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height))
      this.scene = scene
      this.scene.setup()
    }

    start() {
      this._update()
      this._render()
      document.addEventListener(`keydown`, event => this._onkeydown(event))
      document.addEventListener(`keyup`,   event => this._onkeyup(event))
    }

    _update(tick) {
      requestAnimationFrame(tick => this._update(tick))
      this.scene.update(tick)
    }

    _render(tick) {
      requestAnimationFrame(tick => this._render(tick))
      this.scene.render(tick)
    }

    _onkeydown(event) {
      this.scene.onkeydown(event)
    }

    _onkeyup(event) {
      this.scene.onkeyup(event)
    }
  }

  /**
   * Driver to Parse Notechart (Interface)
   */
  class Driver {
    parse(notechart) {}
    calc_judgetime(note, player, moment) {}
    calc_judgetimeln(note, player, moment) {}
  }

  /**
   * Driver of StepMania
   */
  class StepMania extends Driver {
    parse(notechart) {
      const chart = notechart.split(/[\n\r]+/).reduce((acc, line) => {
        if (line.includes(`,  //`)) return `${acc},`
        if (line.includes(`//`))    return `${acc}`
                                    return `${acc}${line}`
      }).split(`;`).map(v => v.split(`:`).map(v => v.split(`,`).map(v => {
        if (v.includes(`=`)) return v.split(`=`)
                             return v
      }))).map(([ k, v ]) => [ ...k, v ])
      return this._prepare(chart)
    }

    _prepare(notechart) {
      let   offset = 0
      const chart  = notechart.reduce((acc, [ k, v ]) => {
        switch (k) {
        case `#OFFSET` :
          offset = v[0]
          return acc

        case `#BPMS` :
          acc.timeline.push(new Moment(-offset, 0, v[0][1] / 60, v[0][1]))
          return { ...acc, timeline : v.reduce(this._prepare_timeline, acc.timeline) }

        case `#NOTES` :
          return { ...acc, lanes : v.reduce(this._prepare_lanes, acc.lanes) }

        default :
          return acc
        }
      }, {
        checkpoint : new Checkpoint(),
        timeline   : new Timeline(),
        lanes      : [ ...Array(number_of_lanes) ].map(() => new Lane())
      })

      const end = chart.lanes.reduce((acc, lane) => (lane.length !== 0) ? Math.max(acc, lane.at_last().timestamp) : acc, 0)
      chart.checkpoint.terminate(new Timestamp(end + 1))
      chart.checkpoint.terminate(new Timestamp(Number.MAX_VALUE))
      chart.timeline.terminate(new Moment(Number.MAX_VALUE, 0, 0, 0))
      chart.lanes.forEach(lane => lane.terminate(new Note(Number.MAX_VALUE, 0, 0, 0)))
      chart.totalnotes = chart.lanes.reduce((acc, lane) => acc + lane.length, 0)
      return chart
    }

    _prepare_timeline(acc, [ beat, bpm ], i) {
      if (i === 0) return acc
      const state  = acc.at_last()
      const second = state.second + (beat - state.time) * 60 / state.bpm
      return acc.push(new Moment(second, beat, bpm / 60, bpm))
    }

    _prepare_lanes(lanes, measure, i) {
      [].forEach.call(measure, (note, j) => {
        const lane = j % 8
        const beat = (i + (j - lane) / measure.length) * 4
        switch (note) {
        case `1` :
          return lanes[lane].push(new Note(beat, 0, 5, 1))

        case `2` :
          return lanes[lane].push(new Note(beat, 0, 5, 1))

        case `3` :
          return lanes[lane].at_last().timeln = beat
        }
      })
      return lanes
    }

    calc_judgetime(note, player, moment) {
      return (note.time - player.time) * 60 / moment.bpm
    }

    calc_judgetimeln(note, player, moment) {
      return (note.timeln - player.time) * 60 / moment.bpm
    }
  }

  /**
   * Driver of Dancing Onigiri
   */
  class DancingOnigiri extends Driver {
    parse(notechart) {
      const chart = notechart.split(/[\n\r\&]+/).filter(line => {
        return /.=./.test(line)
      }).map(v => v.split(`=`).map(v => v.split(`,`))).map(([ k, v ]) => [ ...k, v ])
      return this._prepare(chart)
    }

    _prepare(notechart) {
      const chart = notechart.reduce((acc, [ k, v ]) => {
        switch (k) {
        case `left_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanes.bind(this, 0), acc.lanes) }

        case `leftdia_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanes.bind(this, 1), acc.lanes) }

        case `down_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanes.bind(this, 2), acc.lanes) }

        case `space_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanes.bind(this, 3), acc.lanes) }

        case `up_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanes.bind(this, 4), acc.lanes) }

        case `rightdia_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanes.bind(this, 5), acc.lanes) }

        case `right_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanes.bind(this, 6), acc.lanes) }

        case `frzLeft_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanesln.bind(this, 0), acc.lanes) }

        case `frzLdia_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanesln.bind(this, 1), acc.lanes) }

        case `frzDown_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanesln.bind(this, 2), acc.lanes) }

        case `frzSpace_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanesln.bind(this, 3), acc.lanes) }

        case `frzUp_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanesln.bind(this, 4), acc.lanes) }

        case `frzRdia_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanesln.bind(this, 5), acc.lanes) }

        case `frzRight_data` :
          return { ...acc, lanes : v.reduce(this._prepare_lanesln.bind(this, 6), acc.lanes) }

        case `speed_change` :
          return { ...acc, timeline : v.reduce(this._prepare_timeline, acc.timeline) }

        default :
          return acc
        }
      }, {
        checkpoint : new Checkpoint(),
        timeline   : new Timeline(new Moment(0, 0, 60, 0)),
        lanes      : [ ...Array(number_of_lanes) ].map(() => new Lane())
      })

      chart.timeline.terminate(new Moment(Number.MAX_VALUE, 0, 0, 0))

      chart.lanes.forEach(lane => {
        lane._array.sort((a, b) => a.time - b.time)
        lane._array.map(note => this._realignment(note, chart))
        lane.terminate(new Note(Number.MAX_VALUE, 0, 0, 0))
      })

      const end = chart.lanes.reduce((acc, lane) => (lane.length !== 0) ? Math.max(acc, lane.at_last().timestamp) : acc, 0)
      chart.checkpoint.terminate(new Timestamp(end + 200))
      chart.checkpoint.terminate(new Timestamp(Number.MAX_VALUE))
      chart.totalnotes = chart.lanes.reduce((acc, lane) => acc + lane.length, 0)
      return chart
    }

    _prepare_timeline(acc, _, i, speed_change) {
      if (i % 2 === 1) return acc
      const second = speed_change[i] / 60
      const moment = acc.at_last()
      const frame  = moment.time + (second - moment.second) * moment.velocity
      return acc.push(new Moment(second, frame, speed_change[i + 1] * 60, 0))
    }

    _prepare_lanes(lane, lanes, frame, i) {
      lanes[lane].push(new Note(frame, 0, 200, 16))
      return lanes
    }

    _prepare_lanesln(lane, lanes, frame, i) {
      if (i % 2 === 0) lanes[lane].push(new Note(frame, 0, 200, 16))
      if (i % 2 === 1) lanes[lane].at_last().timeln = frame
      return lanes
    }

    _realignment(note, notechart) {
      const second = note.time / 60
      const moment = notechart.timeline.forward_tmp(second)
      note.time    = moment.time + (second - moment.second) * moment.velocity
      if (note.timeln === 0) return note

      const secondln = note.timeln / 60
      const momentln = notechart.timeline.forward_tmp(secondln)
      note.timeln    = momentln.time + (secondln - momentln.second) * momentln.velocity
      return note
    }

    calc_judgetime(note, player, moment) {
      return (moment.velocity === 0) ? Number.MAX_VALUE : (note.time - player.time) / moment.velocity
    }

    calc_judgetimeln(note, player, moment) {
      return (moment.velocity === 0) ? Number.MAX_VALUE : (note.timeln - player.time) / moment.velocity
    }
  }

  /**
   * Player
   */
  class Player {
    constructor(totalnotes) {
      this.time           = 0
      this.state_judge    = 0
      this.state_lnjudges = [ ...Array(number_of_lanes) ].map(() => 0)
      this.state_inputs   = [ ...Array(number_of_lanes) ].map(() => false)
      this.started_at     = performance.now()
      this.score          = new Score(totalnotes)
      this.gameover       = false
    }
  }

  /**
   * Scene Interface
   */
  class Scene {
    setup() {
      this.layout = JSON.parse(JSON.stringify(layout[this.constructor.name.toLowerCase()]))
      this.expand(this.layout).forEach(text => {
        Object.assign(stage[Layer.CONTAINER], text[0])
        stage[Layer.CONTAINER].fillText(...text[1])
      })
    }

    expand(layout) {}
    update(tick) {}
    render(tick) {}
    onkeydown(event) {}
    onkeyup(event) {}
  }

  /**
   * Title Scene
   */
  class Title extends Scene {
    expand(layout) {
      layout.text.forEach(text => {
        text[1][0] = text[1][0].replace(`__TITLE__`,  music.title)
        text[1][0] = text[1][0].replace(`__ARTIST__`, music.artist)
        text[1][0] = text[1][0].replace(`__EDITOR__`, music.noteeditor)
      })
      return layout.text
    }

    onkeydown(event) {
      switch (event.key) {
        case `Enter`:
          event.preventDefault()
          rhythmgame.setup(new Game())
          return
      }
    }
  }

  /**
   * Game Scene
   */
  class Game extends Scene {
    setup() {
      this.layout  = JSON.parse(JSON.stringify(layout[this.constructor.name.toLowerCase()]))
      this.player  = new Player(notechart.totalnotes)
      this._buffer = new Drawbuffer(notechart.totalnotes)

      drawImage(stage[Layer.JUDGELINE], sprite, ...this.layout.lane.target_line)

      sound.currentTime = 0
      sound.play()
      sound.addEventListener(`ended`, () => { this.player.gameover = true }, { once : true })

      notechart.checkpoint.rewind()
      notechart.timeline.rewind()
      notechart.lanes.forEach(lane => lane.rewind())
    }

    update(tick) {
      if (this.player.gameover) {
        sound.pause()
        rhythmgame.setup(new Title())
      }

      const second     = (tick - this.player.started_at) / 1000
      const moment     = notechart.timeline.forward(second)
      this.player.time = moment.time + (second - moment.second) * moment.velocity

      notechart.lanes.forEach((lane, i) => {
        if (this.player.time >= lane.at(0).time + lane.at(0).delay_judge * Number(!option.autoplay))
          this._judge(lane, i)

        if (this.player.state_lnjudges[i] !== 0)
          this._judgeln(lane, i)
      })

      if (this.player.time >= notechart.checkpoint.at(0).time) {
        this._combocount(this.player.score)
        requestAnimationFrame(() => rhythmgame.setup(new Result(this.player.score)))
        notechart.checkpoint.shift()
      }
    }

    _judge(lane, index) {
      if (this.player.state_lnjudges[index] !== 0) {
        this._judgeln(lane, index)
        return
      }

      const timing_cool  = 0.025
      const timing_great = 0.050
      const timing_good  = 0.100

      const time = rhythmgame.driver.calc_judgetime(lane.at(0), this.player, notechart.timeline.at(0))
      if (time >= timing_good) return

      if (time <= -timing_good) {
        this._calcreset()
        lane.shift()
        return
      }

      let   judge    = 0
      const abs_time = Math.abs(time)
      if (abs_time < timing_cool)  judge = Judge.COOL;  else
      if (abs_time < timing_great) judge = Judge.GREAT; else
      if (abs_time < timing_good)  judge = Judge.GOOD;  else return

      if (lane.at(0).timeln !== 0) {
        this.player.state_lnjudges[index] = judge
        return
      }

      this._calculate(judge, index)
      lane.shift()
    }

    _judgeln(lane, index) {
      if (!option.autoplay && !this.player.state_inputs[index]) {
        this._calcreset()
        this.player.state_lnjudges[index] = 0
        lane.shift()
        return
      }

      const time = rhythmgame.driver.calc_judgetimeln(lane.at(0), this.player, notechart.timeline.at(0))
      if (time > 0) {
        requestAnimationFrame(() => this._draw_flash(index))
        return
      }

      this._calculate(this.player.state_lnjudges[index], index)
      this.player.state_lnjudges[index] = 0
      lane.shift()
    }

    _calculate(judge, i) {
      this.player.score.judges[judge]++
      this.player.score.combo++
      this.player.state_judge = judge
      requestAnimationFrame(() => this._draw_combo())
      requestAnimationFrame(() => this._draw_flash(i))
    }

    _calcreset() {
      this.player.score.judges[Judge.BAD]++
      this._combocount(this.player.score)
      this.player.state_judge = 0
      requestAnimationFrame(() => this._draw_combo())
    }

    _combocount(score) {
      score.maxcombo = Math.max(score.combo, score.maxcombo)
      score.combo = 0
    }

    render(tick) {
      const height   = this.layout.lane.height
      const target_y = this.layout.lane.target_line[5]
      this._clear()

      notechart.lanes.forEach((lane, i) => {
        stage[Layer.CONTAINER].fillStyle = this.layout.lane.color[i]

        for (let j = 0; j < lane.length; j++) {
          const note = lane.at(j)
          if (note.time > this.player.time + note.lifetime) continue

          const y = Math.min(target_y, Math.trunc(height * option.speed * (this.player.time - note.time) / note.lifetime + target_y))

          if (note.timeln === 0) {
            this._draw(y, i)
            continue
          }

          const y2 = Math.min(target_y, Math.trunc(height * option.speed * (this.player.time - note.timeln) / note.lifetime + target_y))
          this._draw_bar(y, y2, i)
          this._draw(y,  i)
          this._draw(y2, i)
        }
      })
    }

    _draw(y, i) {
      const rect = [ this.layout.lane.face[i][4], y, this.layout.lane.face[i][2], this.layout.lane.face[i][3] ]
      drawImage(stage[Layer.CONTAINER], sprite, ...this.layout.lane.face[i], y)
      stage[Layer.CONTAINER].globalCompositeOperation = `source-atop`
      stage[Layer.CONTAINER].fillRect(...rect)
      stage[Layer.CONTAINER].globalCompositeOperation = `source-over`
      this._buffer.push(rect)
    }

    _draw_bar(y1, y2, i) {
      const _y2  = y2 + this.layout.lane.face_alpha[i][3] / 2
      const rect = [ this.layout.lane.face_alpha[i][4], _y2, this.layout.lane.face_alpha[i][2], y1 - y2]
      stage[Layer.CONTAINER].drawImage(sprite, ...this.layout.lane.bar[i], _y2, this.layout.lane.bar[i][2], y1 - y2)
      stage[Layer.CONTAINER].globalCompositeOperation = `source-atop`
      stage[Layer.CONTAINER].fillRect(...rect)
      stage[Layer.CONTAINER].globalCompositeOperation = `destination-out`
      drawImage(stage[Layer.CONTAINER], sprite, ...this.layout.lane.face_alpha[i], y1)
      drawImage(stage[Layer.CONTAINER], sprite, ...this.layout.lane.face_alpha[i], y2)
      stage[Layer.CONTAINER].globalCompositeOperation = `source-over`
      this._buffer.push(rect)
    }

    _draw_flash(i) {
      const y    = this.layout.lane.target_line[5]
      const rect = [ this.layout.lane.flash[i][4], y, this.layout.lane.flash[i][2], this.layout.lane.flash[i][3] ]
      drawImage(stage[Layer.TEXTEFFECT], sprite, ...this.layout.lane.flash[i], y)
      setTimeout(() => stage[Layer.TEXTEFFECT].clearRect(...rect), 50)
    }

    _clear() {
      for (let i = 0; i < this._buffer.length; i++) {
        stage[Layer.CONTAINER].clearRect(...this._buffer.at(i))
      }
      this._buffer.clear()
    }

    _draw_combo() {
      stage[Layer.TEXTEFFECT].fillStyle = this.layout.judge.color[this.player.state_judge]
      stage[Layer.TEXTEFFECT].clearRect(0, stage[Layer.TEXTEFFECT].canvas.height / 2 - 24, stage[Layer.TEXTEFFECT].canvas.width, 48)

      if (this.player.state_judge === 0) return
      stage[Layer.TEXTEFFECT].fillText(this.player.score.combo, stage[Layer.TEXTEFFECT].canvas.width / 2, stage[Layer.TEXTEFFECT].canvas.height / 2)
    }

    onkeydown(event) {
      const speed = option.speed
      switch (event.key) {
        case `Tab`:
          event.preventDefault()
          option.speed = Math.min(speed + 0.25, 5.00)
          return

        case `Shift`:
          event.preventDefault()
          option.speed = Math.max(speed - 0.25, 1.00)
          return

        case `Delete`:
          event.preventDefault()
          this.player.gameover = true
          return
      }

      if (option.autoplay) return

      [].forEach.call(option.keybinds, (key, i) => {
        if (event.key !== key) return
        this.player.state_inputs[i] = true
        this._judge(notechart.lanes[i], i)
      })
    }

    onkeyup(event) {
      if (option.autoplay) return
      [].forEach.call(option.keybinds, (key, i) => {
        if (event.key !== key) return
        this.player.state_inputs[i] = false
      })
    }
  }

  /**
   * Result Scene
   */
  class Result extends Scene {
    constructor(score) {
      super()
      this.score = score
    }

    expand(layout) {
      layout.text.forEach(text => {
        text[1][0] = text[1][0].replace(`__COOL__` , this.score.judges[Judge.COOL])
        text[1][0] = text[1][0].replace(`__GREAT__`, this.score.judges[Judge.GREAT])
        text[1][0] = text[1][0].replace(`__GOOD__` , this.score.judges[Judge.GOOD])
        text[1][0] = text[1][0].replace(`__BAD__`  , this.score.judges[Judge.BAD])
        text[1][0] = text[1][0].replace(`__SCORE__`, this.score.point)
      })
      return layout.text
    }
  }

  const rhythmgame = new Rhythmgame()
  const profile    = document.querySelector(`script#rhythmgame`).getAttribute(`name`)

  const { music, sound, notechart, option, layout, sprite } = await rhythmgame.fetch(`${profile}/settings.json`)

  const stage = rhythmgame.prepare_stage()

  rhythmgame.setup(new Title())
  rhythmgame.start()

  function drawImage(context, image, sx, sy, sWidth, sHeight, dx, dy) {
    context.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, sWidth, sHeight)
  }
})()
