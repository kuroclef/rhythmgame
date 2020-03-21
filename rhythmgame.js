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

`use strict`
{
  const number_of_lanes = 8

  /**
   * Enumeration of Judge
   */
  const Judge = Object.freeze({
    COOL  : 1,
    GREAT : 2,
    GOOD  : 3,
    BAD   : 0
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
   * Structure of Blitbuffer [ Buffer ... ]
   */
  class Blitbuffer {
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
      this._buffer.map(_ => null)
      this.length = 0
    }
  }

  /**
   * Score
   */
  class Score {
    constructor(totalnotes) {
      this.judges     = Object.keys(Judge).map(_ => 0)
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
    async load() {
      const profile = document.querySelector(`script#rhythmgame`).getAttribute(`name`)
      Object.assign(this, await this._fetch(`${profile}/settings.json`))
      Object.assign(this, await this._proc(this))
    }

    _fetch(url) {
      const suffix = url.slice(url.lastIndexOf(`.`) + 1)
      switch (suffix) {
      case `png` :
        return new Promise((resolve, reject) => {
          const request = new Image()
          request.src   = url
          request.addEventListener(`load`,  _ => resolve(request))
          request.addEventListener(`error`, _ => reject(request.statusText))
        })

      case `ogg` : case `mp3` :
        return new Promise((resolve, reject) => {
          const request = new Audio()
          request.src   = url
          request.addEventListener(`loadeddata`, _ => resolve(request))
          request.addEventListener(`error`,      _ => reject(request))
        })

      case `ssc` :
        return new Promise((resolve, reject) => {
          const request = new XMLHttpRequest()
          request.addEventListener(`load`,  _ => resolve(this._parse(new StepMania(), request.responseText)))
          request.addEventListener(`error`, _ => reject(request.statusText))
          request.open(`GET`, url)
          request.send()
        })

      case `txt` :
        return new Promise((resolve, reject) => {
          const request = new XMLHttpRequest()
          request.addEventListener(`load`,  _ => resolve(this._parse(new DancingOnigiri(), request.responseText)))
          request.addEventListener(`error`, _ => reject(request.statusText))
          request.open(`GET`, url)
          request.send()
        })

      case `json` :
        return new Promise((resolve, reject) => {
          const request = new XMLHttpRequest()
          request.addEventListener(`load`,  _ => resolve(JSON.parse(request.responseText)))
          request.addEventListener(`error`, _ => reject(request.statusText))
          request.open(`GET`, url)
          request.send()
        })
      }
    }

    async _proc(settings) {
      const _settings = Object.entries(settings).filter(([ _, v ]) => typeof v === `string`)
      for (const [ k, v ] of _settings) settings[k] = await this._fetch(v)
    }

    _parse(parserdriver, sheet) {
      this.parserdriver = parserdriver
      return parserdriver.parse(sheet)
    }

    build() {
      this.stage = this._prepare_stage()
      this.sheet = this.parserdriver.prepare(this.sheet)
    }

    _prepare_stage() {
      const container = document.querySelector(`div#stage`)
      return [ ...Array(2) ].map((_, i) => {
        const canvas  = document.createElement(`canvas`)
        canvas.width  = parseInt(container.style.width)
        canvas.height = parseInt(container.style.height)
        container.appendChild(canvas)
        return Object.assign(canvas.getContext(`2d`), {
          font         : `300 48px Open Sans`,
          textAlign    : [ `left`, `center` ][i],
          textBaseline : `middle`
        })
      })
    }

    setup(scene) {
      this.stage.forEach(layer => layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height))
      this.scene = scene
      this.scene.setup(this)
    }

    start() {
      this._update()
      this._render()
      document.addEventListener(`keydown`, event => this._onkeydown(event))
      document.addEventListener(`keyup`,   event => this._onkeyup(event))
    }

    _update(tick) {
      requestAnimationFrame(tick => this._update(tick))
      this.scene.update(this, tick)
    }

    _render(tick) {
      requestAnimationFrame(tick => this._render(tick))
      this.scene.render(this, tick)
    }

    _onkeydown(event) {
      this.scene.onkeydown(this, event)
    }

    _onkeyup(event) {
      this.scene.onkeyup(this, event)
    }
  }

  /**
   * Parser Driver of Music Sheet (Interface)
   */
  class ParserDriver {
    parse(sheet) {}
    prepare(sheet) {}
    calc_judgetime(note, player, moment) {}
  }

  /**
   * Parser Driver of Music Sheet (for StepMania)
   */
  class StepMania extends ParserDriver {
    parse(sheet) {
      return sheet.split(/[\n\r]+/).reduce((acc, line) => {
        if (line.includes(`,  //`)) return `${acc},`
        if (line.includes(`//`))    return `${acc}`
                                    return `${acc}${line}`
      }).split(`;`).map(v => v.split(`:`).map(v => v.split(`,`).map(v => {
        if (v.includes(`=`)) return v.split(`=`)
                             return v
      }))).map(([ k, v ]) => [ ...k, v ])
    }

    prepare(sheet) {
      let   offset = 0
      const _sheet = sheet.reduce((acc, [ k, v ]) => {
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
        lanes      : [ ...Array(number_of_lanes) ].map(_ => new Lane())
      })

      const end = _sheet.lanes.reduce((acc, lane) => (lane.length !== 0) ? Math.max(acc, lane.at_last().timestamp) : acc, 0)
      _sheet.checkpoint.terminate(new Timestamp(end + 1))
      _sheet.checkpoint.terminate(new Timestamp(Number.MAX_VALUE))
      _sheet.timeline.terminate(new Moment(Number.MAX_VALUE, 0, 0, 0))
      _sheet.lanes.forEach(lane => lane.terminate(new Note(Number.MAX_VALUE, 0, 0, 0)))
      _sheet.totalnotes = _sheet.lanes.reduce((acc, lane) => acc + lane.length, 0)
      return _sheet
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
   * Parser Driver of Music Sheet (for Dancing Onigiri)
   */
  class DancingOnigiri extends ParserDriver {
    parse(sheet) {
      return sheet.split(/[\n\r\&]+/).filter(line => {
        return /.=./.test(line)
      }).map(v => v.split(`=`).map(v => v.split(`,`))).map(([ k, v ]) => [ ...k, v ])
    }

    prepare(sheet) {
      const _sheet   = sheet.reduce((acc, [ k, v ]) => {
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
        lanes      : [ ...Array(number_of_lanes) ].map(_ => new Lane())
      })

      _sheet.timeline.terminate(new Moment(Number.MAX_VALUE, 0, 0, 0))

      _sheet.lanes.forEach(lane => {
        lane._array.sort((a, b) => a.time - b.time)
        lane._array.map(note => this._realignment(note, _sheet))
        lane.terminate(new Note(Number.MAX_VALUE, 0, 0, 0))
      })

      const end = _sheet.lanes.reduce((acc, lane) => (lane.length !== 0) ? Math.max(acc, lane.at_last().timestamp) : acc, 0)
      _sheet.checkpoint.terminate(new Timestamp(end + 200))
      _sheet.checkpoint.terminate(new Timestamp(Number.MAX_VALUE))
      _sheet.totalnotes = _sheet.lanes.reduce((acc, lane) => acc + lane.length, 0)
      return _sheet
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

    _realignment(note, sheet) {
      const second = note.time / 60
      const moment = sheet.timeline.forward_tmp(second)
      note.time    = moment.time + (second - moment.second) * moment.velocity
      if (note.timeln === 0) return note

      const secondln = note.timeln / 60
      const momentln = sheet.timeline.forward_tmp(secondln)
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
      this.state_lnjudges = [ ...Array(number_of_lanes) ].map(_ => 0)
      this.state_inputs   = [ ...Array(number_of_lanes) ].map(_ => false)
      this.started_at     = performance.now()
      this.score          = new Score(totalnotes)
      this.gameover       = false
    }
  }

  /**
   * Scene Interface
   */
  class Scene {
    setup(rhythmgame) {
      const layout = JSON.parse(JSON.stringify(rhythmgame.layout[this.constructor.name.toLowerCase()]))
      this.expand(rhythmgame, layout).forEach(object => {
        Object.assign(rhythmgame.stage[0], object[0])
        rhythmgame.stage[0].fillText(...object[1])
      })
    }

    expand(rhythmgame, layout) { }
    update(rhythmgame, tick) {}
    render(rhythmgame, tick) {}
    onkeydown(rhythmgame, event) {}
    onkeyup(rhythmgame, event) {}
  }

  /**
   * Title Scene
   */
  class Title extends Scene {
    expand(rhythmgame, layout) {
      layout.forEach(object => {
        switch (object[1][0]) {
        case `title` :
          object[1][0] = rhythmgame.tag.title
          break
        case `artist` :
          object[1][0] = rhythmgame.tag.artist
          break
        }
      })
      return layout
    }

    onkeydown(rhythmgame, event) {
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
    setup(rhythmgame) {
      this.player  = new Player(rhythmgame.sheet.totalnotes)
      this._buffer = new Blitbuffer(rhythmgame.sheet.totalnotes)

      rhythmgame.music.currentTime = 0
      rhythmgame.music.play()
      rhythmgame.music.addEventListener(`ended`, _ => { this.player.gameover = true }, { once : true })

      rhythmgame.sheet.checkpoint.rewind()
      rhythmgame.sheet.timeline.rewind()
      rhythmgame.sheet.lanes.forEach(lane => lane.rewind())
    }

    update(rhythmgame, tick) {
      if (this.player.gameover) {
        rhythmgame.music.pause()
        rhythmgame.setup(new Title())
      }

      const second     = (tick - this.player.started_at) / 1000
      const moment     = rhythmgame.sheet.timeline.forward(second)
      this.player.time = moment.time + (second - moment.second) * moment.velocity

      rhythmgame.sheet.lanes.forEach((lane, i) => {
        if (this.player.time >= lane.at(0).time + lane.at(0).delay_judge * Number(!rhythmgame.option.autoplay))
          this._judge(rhythmgame, lane, i)

        if (this.player.state_lnjudges[i] !== 0)
          this._judgeln(rhythmgame, lane, i)
      })

      if (this.player.time >= rhythmgame.sheet.checkpoint.at(0).time) {
        this._combocount(this.player.score)
        requestAnimationFrame(_ => rhythmgame.setup(new Result(this.player.score)))
        rhythmgame.sheet.checkpoint.shift()
      }
    }

    _judge(rhythmgame, lane, index) {
      if (this.player.state_lnjudges[index] !== 0) {
        this._judgeln(rhythmgame, lane, index)
        return
      }

      const timing_cool  = 0.025
      const timing_great = 0.050
      const timing_good  = 0.100

      const time = rhythmgame.parserdriver.calc_judgetime(lane.at(0), this.player, rhythmgame.sheet.timeline.at(0))
      if (time >= timing_good) return

      if (time <= -timing_good) {
        this._calcreset(rhythmgame)
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

      this._calculate(rhythmgame, judge)
      lane.shift()
    }

    _judgeln(rhythmgame, lane, index) {
      if (!rhythmgame.option.autoplay && !this.player.state_inputs[index]) {
        this._calcreset(rhythmgame)
        this.player.state_lnjudges[index] = 0
        lane.shift()
        return
      }

      const time = rhythmgame.parserdriver.calc_judgetimeln(lane.at(0), this.player, rhythmgame.sheet.timeline.at(0))
      if (time > 0) return

      this._calculate(rhythmgame, this.player.state_lnjudges[index])
      this.player.state_lnjudges[index] = 0
      lane.shift()
    }

    _calculate(rhythmgame, judge) {
      this.player.score.judges[judge]++
      this.player.score.combo++
      this.player.state_judge = judge
      requestAnimationFrame(_ => this._draw_combo(rhythmgame))
    }

    _calcreset(rhythmgame) {
      this.player.score.judges[Judge.BAD]++
      this._combocount(this.player.score)
      this.player.state_judge = 0
      requestAnimationFrame(_ => this._draw_combo(rhythmgame))
    }

    _combocount(score) {
      score.maxcombo = Math.max(score.combo, score.maxcombo)
      score.combo = 0
    }

    render(rhythmgame, tick) {
      const width  = rhythmgame.stage[0].canvas.width
      const height = rhythmgame.stage[0].canvas.height
      this._clear(rhythmgame.stage)

      rhythmgame.sheet.lanes.forEach((lane, i) => {
        rhythmgame.stage[0].fillStyle = rhythmgame.layout.game.notecolor[i]

        for (let j = 0; j < lane.length; j++) {
          const note = lane.at(j)
          if (note.time > this.player.time + note.lifetime) continue

          const y = Math.min(height, Math.trunc(height * rhythmgame.option.speed * (this.player.time - note.time) / note.lifetime + height))

          if (note.timeln === 0) {
            this._blit(y, i, rhythmgame.stage)
            continue
          }

          const y2 = Math.trunc(height * rhythmgame.option.speed * (this.player.time - note.timeln) / note.lifetime + height)
          this._draw_bar(y, y2, i, rhythmgame.stage)
          this._blit(y,  i, rhythmgame.stage)
          this._blit(y2, i, rhythmgame.stage)
        }
      })
    }

    _blit(y, i, stage) {
      const rect = [ 50 * i, y - 10, 50, 10 ]
      stage[0].fillRect(...rect)
      this._buffer.push(rect)
    }

    _draw_bar(y1, y2, i, stage) {
      const rect = [ 50 * i, y2 - 10, 50, y1 - y2]
      stage[0].globalAlpha = 0.5
      stage[0].fillRect(...rect)
      stage[0].globalAlpha = 1
      this._buffer.push(rect)
    }

    _clear(stage) {
      for (let i = 0; i < this._buffer.length; i++) {
        stage[0].clearRect(...this._buffer.at(i))
      }
      this._buffer.clear()
    }

    _draw_combo(rhythmgame) {
      rhythmgame.stage[1].fillStyle = rhythmgame.layout.game.judgecolor[this.player.state_judge]
      rhythmgame.stage[1].clearRect(0, rhythmgame.stage[1].canvas.height / 2 - 24, rhythmgame.stage[1].canvas.width, 48)

      if (this.player.state_judge === 0) return
      rhythmgame.stage[1].fillText(this.player.score.combo, rhythmgame.stage[1].canvas.width / 2, rhythmgame.stage[1].canvas.height / 2)
    }

    onkeydown(rhythmgame, event) {
      const speed = rhythmgame.option.speed
      switch (event.key) {
        case `Tab`:
          event.preventDefault()
          rhythmgame.option.speed = Math.min(speed + 0.25, 5.00)
          return

        case `Shift`:
          event.preventDefault()
          rhythmgame.option.speed = Math.max(speed - 0.25, 1.00)
          return

        case `Delete`:
          event.preventDefault()
          this.player.gameover = true
          return
      }

      if (rhythmgame.option.autoplay) return

      [].forEach.call(rhythmgame.option.keybinds, (key, i) => {
        if (event.key !== key) return
        this.player.state_inputs[i] = true
        this._judge(rhythmgame, rhythmgame.sheet.lanes[i], i)
      })
    }

    onkeyup(rhythmgame, event) {
      if (rhythmgame.option.autoplay) return
      [].forEach.call(rhythmgame.option.keybinds, (key, i) => {
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

    expand(rhythmgame, layout) {
      layout.forEach(object => {
        switch (object[1][0]) {
        case `cool` :
          object[1][0] = this.score.judges[Judge.COOL]
          break
        case `great` :
          object[1][0] = this.score.judges[Judge.GREAT]
          break
        case `good` :
          object[1][0] = this.score.judges[Judge.GOOD]
          break
        case `bad` :
          object[1][0] = this.score.judges[Judge.BAD]
          break
        case `score` :
          object[1][0] = this.score.point
          break
        }
      })
      return layout
    }
  }

  async function main() {
    const rhythmgame = new Rhythmgame()
    await rhythmgame.load()
          rhythmgame.build()
          rhythmgame.setup(new Title())
          rhythmgame.start()
  }

  document.addEventListener(`DOMContentLoaded`, _ => main())
}
