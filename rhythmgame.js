/**
 *  Rhythmgame -- An HTML5-based Rhythm-game engine.
 *  Copyright (C) 2017  Kazumi Moriya <kuroclef@gmail.com>
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
  const lifetime_beats  = 5

  /**
   * Enumerations
   */

  const Judge = Object.freeze({
    COOL  : 1,
    GREAT : 2,
    GOOD  : 3,
    BAD   : 0
  })

  /**
   * Structures
   */

  /**
   * Lane [ Note ... ]
   */

  class Note {
    constructor(beat, length) {
      this.beat   = parseFloat(beat)
      this.length = parseFloat(length)
    }

    get timestamp() {
      return Math.max(this.beat, this.length)
    }
  }

  class Lane {
    constructor() {
      this._array = []
      this._first = 0
      this.length = 0
    }

    at(i) {
      return this._array[this._first + i]
    }

    shift() {
      this._first++
      this.length--
    }

    push(element) {
      this._array.push(element)
      this.length++
      return this
    }

    rewind() {
      this.length += this._first
      this._first  = 0
    }
  }

  /**
   * Checkpoint [ Timestamp ... ]
   */

  class Timestamp {
    constructor(second, beat) {
      this.second = parseFloat(second)
      this.beat   = parseFloat(beat)
    }
  }

  class Checkpoint extends Lane {}

  /**
   * Timeline [ Segment ... ]
   */

  class Segment {
    constructor(second, beat, velocity, bpm) {
      this.second   = parseFloat(second)
      this.beat     = parseFloat(beat)
      this.velocity = parseFloat(velocity)
      this.bpm      = parseFloat(bpm)
    }
  }

  class Timeline extends Lane {
    forward(second) {
      while (this.at(1).second <= second) this.shift()
      return this.at(0)
    }
  }

  /**
   * Blitbuffer [ Buffer ... ]
   */

  class Blitbuffer {
    constructor(length) {
      this._buffer = [ ...Array(length) ]
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
   * Actors
   */

  class Constructor {
    async load() {
      const profile  = document.querySelector(`script#rhythmgame`).getAttribute(`name`)
      Object.assign(this, await this._fetch(`${profile}/manifest.json`))
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
          request.addEventListener(`error`,      _ => reject(request.statusText))
        })

      case `txt` :
        return new Promise((resolve, reject) => {
          const request = new XMLHttpRequest()
          request.addEventListener(`load`,  _ => resolve(this._parse(request.responseText)))
          request.addEventListener(`error`, _ => reject(request.statusText))
          request.open(`GET`, url)
          request.send()
        })

      case `json` :
        return new Promise((resolve, reject) => {
          const request   = new XMLHttpRequest()
          request.addEventListener(`load`,  _ => resolve(JSON.parse(request.responseText)))
          request.addEventListener(`error`, _ => reject(request.statusText))
          request.open(`GET`, url)
          request.send()
        })
      }
    }

    async _proc(manifest) {
      const _manifest = Object.entries(manifest).filter(([ _, v ]) => typeof v === `string`)
      for (const [ k, v ] of _manifest) manifest[k] = await this._fetch(v)
    }

    _parse(sheet) {
      return sheet.split(`\n`).reduce((acc, line) => {
        if (line.includes(`,  //`)) return `${acc},`
        if (line.includes(`//`))    return `${acc}`
                                    return `${acc}${line}`
      }).split(`;`).map(v => v.split(`:`).map(v => v.split(`,`).map(v => {
        if (v.includes(`=`)) return v.split(`=`)
                             return v
      }))).map(([ k, v ]) => [ ...k, v ])
    }

    build() {
      this.stage = this._prepare_stage()
      this.sheet = this._prepare_sheet()
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

    _prepare_sheet() {
      let   offset = 0
      const _sheet = this.sheet.reduce((acc, [ k, v ]) => {
        switch (k) {
        case `#OFFSET` :
          offset = v[0]
          return { ...acc, checkpoint : new Checkpoint() }

        case `#BPMS` :
          const timeline = new Timeline()
          timeline.push(new Segment(-offset, 0, v[0][1] / 60, v[0][1]))
          return { ...acc, timeline : v.reduce(this._prepare_timeline, timeline) }

        case `#NOTES` :
          const lanes = [ ...Array(number_of_lanes) ].map(_ => new Lane())
          return { ...acc, lanes : v.reduce(this._prepare_lanes, lanes) }

        default :
          return acc
        }
      }, {})

      const end = _sheet.lanes.reduce((acc, lane) => (lane.length) ? Math.max(acc, lane.at(lane.length - 1).timestamp) : acc, 0)
      _sheet.checkpoint._array.push(new Timestamp(Number.MAX_VALUE, end + 1), new Timestamp(Number.MAX_VALUE, Number.MAX_VALUE))
      _sheet.timeline._array.push(new Segment(Number.MAX_VALUE, 0, 0, 0))
      _sheet.lanes.forEach(lane => lane._array.push(new Note(Number.MAX_VALUE, 0)))

      _sheet.totalnotes = _sheet.lanes.reduce((acc, lane) => acc + lane.length, 0)

      return _sheet
    }

    _prepare_checkpoint(acc, second, i) {
      return acc.push(new Timestamp(second, Number.MAX_VALUE))
    }

    _prepare_timeline(acc, [ beat, bpm ], i) {
      if (i === 0) return acc
      const state_second = acc.at(i - 1).second
      const state_beat   = acc.at(i - 1).beat
      const state_bpm    = acc.at(i - 1).bpm

      const second = state_second + (beat - state_beat) * 60 / state_bpm
      return acc.push(new Segment(second, beat, bpm / 60, bpm))
    }

    _prepare_lanes(lanes, measure, i) {
      [].forEach.call(measure, (note, j) => {
        const lane = j % 8
        const beat = (i + (j - lane) / measure.length) * 4
        switch (note) {
        case `1` :
          return lanes[lane].push(new Note(beat, 0))

        case `2` :
          return lanes[lane].push(new Note(beat, 0))

        case `3` :
          return lanes[lane].at(lanes[lane].length - 1).length = beat
        }
      })
      return lanes
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

  class Player {
    constructor(totalnotes) {
      this.beat           = 0
      this.state_judge    = 0
      this.state_lnjudges = [ ...Array(number_of_lanes) ].map(_ => 0)
      this.state_inputs   = [ ...Array(number_of_lanes) ].map(_ => false)
      this.started_at     = performance.now()
      this.score          = new Score(totalnotes)
      this.gameover       = false
    }
  }

  /**
   * Scenes
   */

  class Scene {
    setup(constructor) {}
    update(constructor, tick) {}
    render(constructor, tick) {}
    onkeydown(constructor, event) {}
    onkeyup(constructor, event) {}
  }

  class Title extends Scene {
    setup(constructor) {
      this.draw(constructor)
    }

    draw(constructor) {
      const layout = JSON.parse(JSON.stringify(constructor.layout.title))
      layout.forEach(object => {
        switch (object[1][0]) {
        case `title` :
          object[1][0] = constructor.tags.title
          break
        case `artist` :
          object[1][0] = constructor.tags.artist
          break
        }
      })

      constructor.stage.forEach(layer => layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height))

      layout.forEach(object => {
        Object.assign(constructor.stage[0], object[0])
        constructor.stage[0].fillText(...object[1])
      })
    }

    onkeydown(constructor, event) {
      switch (event.key) {
        case `Enter`:
          event.preventDefault()
          constructor.setup(new Game(constructor))
          return
      }
    }
  }

  class Game extends Scene {
    setup(constructor) {
      this.player  = new Player(constructor.sheet.totalnotes)
      this._buffer = new Blitbuffer(constructor.sheet.totalnotes)

      constructor.music.currentTime = 0
      constructor.music.play()
      constructor.music.addEventListener(`ended`, _ => this._gameover(), { once : true })

      constructor.sheet.checkpoint.rewind()
      constructor.sheet.timeline.rewind()
      constructor.sheet.lanes.forEach(lane => lane.rewind())
    }

    update(constructor, tick) {
      if (this.player.gameover) {
        constructor.music.pause()
        constructor.setup(new Title(constructor))
      }

      const second     = (tick - this.player.started_at) / 1000
      const segment    = constructor.sheet.timeline.forward(second)
      this.player.beat = segment.beat + (second - segment.second) * segment.velocity

      constructor.sheet.lanes.forEach((lane, i) => {
        if (this.player.beat >= lane.at(0).beat + Number(!constructor.option.autoplay))
          this._judge(constructor, lane, i)

        if (this.player.state_lnjudges[i])
          this._judgeln(constructor, lane, i)
      })

      if (this.player.beat >= constructor.sheet.checkpoint.at(0).beat) {
        this._combocount(this.player.score)
        requestAnimationFrame(_ => this._draw_result(constructor))
        constructor.sheet.checkpoint.shift()
      }
    }

    _gameover() {
      this.player.gameover = true
    }

    _judge(constructor, lane, index) {
      if (this.player.state_lnjudges[index]) {
        this._judgeln(constructor, lane, index)
        return
      }

      const timing_cool  = 0.025
      const timing_great = 0.050
      const timing_good  = 0.100

      const time = (lane.at(0).beat - this.player.beat) * 60 / constructor.sheet.timeline.at(0).bpm
      if (time >= timing_good) return

      if (time <= -timing_good) {
        this._calcreset(constructor)
        lane.shift()
        return
      }

      let   judge  = 0
      const abs_time = Math.abs(time)
      if (abs_time < timing_cool)  judge = Judge.COOL;  else
      if (abs_time < timing_great) judge = Judge.GREAT; else
      if (abs_time < timing_good)  judge = Judge.GOOD;  else return

      if (lane.at(0).length > 0) {
        this.player.state_lnjudges[index] = judge
        return
      }

      this._calculate(constructor, judge)
      lane.shift()
    }

    _judgeln(constructor, lane, index) {
      if (!constructor.option.autoplay && !this.player.state_inputs[index]) {
        this._calcreset(constructor)
        this.player.state_lnjudges[index] = 0
        lane.shift()
        return
      }

      const time = (lane.at(0).length - this.player.beat) * 60 / constructor.sheet.timeline.at(0).bpm
      if (time > 0) return

      this._calculate(constructor, this.player.state_lnjudges[index])
      this.player.state_lnjudges[index] = 0
      lane.shift()
    }

    _calculate(constructor, judge) {
      this.player.score.judges[judge]++
      this.player.score.combo++
      this.player.state_judge = judge
      requestAnimationFrame(_ => this._draw_combo(constructor))
    }

    _calcreset(constructor) {
      this.player.score.judges[Judge.BAD]++
      this._combocount(this.player.score)
      this.player.state_judge = 0
      requestAnimationFrame(_ => this._draw_combo(constructor))
    }

    _combocount(score) {
      score.maxcombo = Math.max(score.combo, score.maxcombo)
      score.combo = 0
    }

    render(constructor, tick) {
      const width  = constructor.stage[0].canvas.width
      const height = constructor.stage[0].canvas.height
      this._clear(constructor.stage)

      constructor.sheet.lanes.forEach((lane, i) => {
        constructor.stage[0].fillStyle = constructor.layout.game.notecolor[i]

        for (let j = 0; j < lane.length; j++) {
          const note = lane.at(j)
          if (note.beat > this.player.beat + lifetime_beats) continue

          const y = Math.min(height, Math.trunc(height * constructor.option.speed * (this.player.beat - note.beat) / lifetime_beats + height))

          if (note.length <= 0) {
            this._blit(y, i, constructor.stage)
            continue
          }

          const y2 = Math.trunc(height * constructor.option.speed * (this.player.beat - note.length) / lifetime_beats + height)
          this._draw_bar(y, y2, i, constructor.stage)
          this._blit(y,  i, constructor.stage)
          this._blit(y2, i, constructor.stage)
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

    _draw_combo(constructor) {
      constructor.stage[1].fillStyle = constructor.layout.game.judgecolor[this.player.state_judge]
      constructor.stage[1].clearRect(0, constructor.stage[1].canvas.height / 2 - 24, constructor.stage[1].canvas.width, 48)

      if (!this.player.state_judge) return
      constructor.stage[1].fillText(this.player.score.combo, constructor.stage[1].canvas.width / 2, constructor.stage[1].canvas.height / 2)
    }

    onkeydown(constructor, event) {
      const speed = constructor.option.speed
      switch (event.key) {
        case `Tab`:
          event.preventDefault()
          constructor.option.speed = Math.min(speed + 0.25, 5.00)
          return

        case `Shift`:
          event.preventDefault()
          constructor.option.speed = Math.max(speed - 0.25, 1.00)
          return

        case `Delete`:
          event.preventDefault()
          this.player.gameover = true
          return
      }

      if (constructor.option.autoplay) return

      [].forEach.call(constructor.option.keybinds, (key, i) => {
        if (event.key !== key) return
        this.player.state_inputs[i] = true
        this._judge(constructor, constructor.sheet.lanes[i], i)
      })
    }

    onkeyup(constructor, event) {
      if (constructor.option.autoplay) return
      [].forEach.call(constructor.option.keybinds, (key, i) => {
        if (event.key !== key) return
        this.player.state_inputs[i] = false
      })
    }

    _draw_result(constructor) {
      const layout = JSON.parse(JSON.stringify(constructor.layout.result))
      layout.forEach(object => {
        switch (object[1][0]) {
        case `cool` :
          object[1][0] = this.player.score.judges[Judge.COOL]
          break
        case `great` :
          object[1][0] = this.player.score.judges[Judge.GREAT]
          break
        case `good` :
          object[1][0] = this.player.score.judges[Judge.GOOD]
          break
        case `bad` :
          object[1][0] = this.player.score.judges[Judge.BAD]
          break
        case `score` :
          object[1][0] = this.player.score.point
          break
        }
      })

      constructor.stage.forEach(layer => layer.clearRect(0, 0, layer.canvas.width, layer.canvas.height))

      layout.forEach(object => {
        Object.assign(constructor.stage[0], object[0])
        constructor.stage[0].fillText(...object[1])
      })
    }
  }

  async function main() {
    const constructor = new Constructor()
    await constructor.load()
          constructor.build()
          constructor.setup(new Title(constructor))
          constructor.start()
  }

  document.addEventListener(`DOMContentLoaded`, _ => main())
}
