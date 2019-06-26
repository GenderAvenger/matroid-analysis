import csv from 'csv'
import fs from 'fs'

import { MATCH_THRESSHOLD } from '../../constants'

const parser = csv.parse()

const indexOfTargetFilePathFlag = (arr) => {
  const shortIndex = arr.indexOf('--f')
  if (shortIndex !== -1) {
    return shortIndex
  }
  return arr.indexOf('-file')
}

const getTargetFilePath = () => {
  const flagIndex = indexOfTargetFilePathFlag(process.argv)
  if (flagIndex === -1 || process.argv.length <= flagIndex) {
    throw new Error('Please provide a file path using --f [path] or -f [path]')
  }
  return process.argv[flagIndex + 1]
}

const getMaxValues = (arr1, arr2) => arr1.map((value, i) => (value > arr2[i] ? value : arr2[i]))

const combineCommonTimestamps = rows => rows
  .reduce((combined, row) => {
    const previousRow = combined.pop()
    const previousSecond = previousRow[0]
    const second = row[0]
    if (second === previousSecond) {
      combined.push(getMaxValues(row, previousRow))
    } else {
      combined.push(previousRow)
      combined.push(row)
    }
    return combined
  }, [rows[0]])


const getFaceCount = weights => weights
  .reduce((total, weight) => {
    if (weight > MATCH_THRESSHOLD) {
      return total + 1
    }
    return total
  }, 0)

const calculateCandidateAppearences = (candidates, rows) => {
  const processedCandidates = candidates
  rows.map((row) => {
    const second = row[0]
    const weights = row.slice(1)
    const faceCount = getFaceCount(weights)
    weights.map((weight, i) => {
      if (weight > MATCH_THRESSHOLD) {
        if (faceCount === 1) {
          processedCandidates[i].secondsAlone += 0.5
        } else if (faceCount === 2) {
          processedCandidates[i].secondsWithAnother += 0.5
        } else {
          processedCandidates[i].secondsInGroup += 0.5
        }
        processedCandidates[i].facetimeMap.push(second)
      }
      return weight
    })
    return row
  })

  return processedCandidates
}

const calculateTimeTotals = filePath => new Promise((resolve) => {
  const rows = []
  fs.createReadStream(filePath)
    .pipe(parser)
    .on('data', row => rows.push(row.slice(0, -4)))
    .on('end', () => {
      const firstRow = rows.shift()
      const candidates = firstRow
        .slice(1)
        .map(candidate => ({
          name: candidate,
          secondsAlone: 0, // Number of seconds appearing on screen alone
          secondsWithAnother: 0, // Number of seconds appearing on screen with one other candidate
          secondsInGroup: 0, // Number of seconds appearing on screen with two+ other candidates
          facetimeMap: [], // The set of seconds that the candidate appeared on screen
        }))

      const combinedRows = combineCommonTimestamps(rows)
      const candidateAppearences = calculateCandidateAppearences(candidates, combinedRows)
      resolve(candidateAppearences)
    })
})

const saveProcessedResults = (timeTotals) => {
  const data = timeTotals.map(candidate => ([
    candidate.name,
    candidate.secondsAlone,
    candidate.secondsWithAnother,
    candidate.secondsInGroup,
    ...candidate.facetimeMap,
  ]))

  data.unshift([
    'Name',
    'Seconds alone',
    'Seconds with another',
    'Seconds in group',
    'Moments on screen',
  ])

  csv.stringify(data,
    {},
    (stringifyError, output) => {
      if (stringifyError) throw stringifyError
      fs.writeFile(`results/${Date.now()}.csv`, output, (writeError) => {
        if (writeError) throw writeError
      })
    })
}

const targetFilePath = getTargetFilePath()
calculateTimeTotals(targetFilePath)
  .then(saveProcessedResults)
